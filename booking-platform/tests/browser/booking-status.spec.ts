import { test, expect, bookingId, departure, returning, capture, expectNoHorizontalOverflow } from "./fixtures";
import type { BookingStatusDetails } from "../../src/lib/booking-status";

const detailsPath = `/api/bookings/${bookingId}/details`;
const detailsKey = `GET ${detailsPath}`;
const statusPath = `/my-trips/${bookingId}`;

function details(product: "FLIGHT" | "HOTEL" = "FLIGHT", status = "BOOKING_PENDING"): BookingStatusDetails {
  return {
    id: bookingId,
    reference: "MT-SYNTHETIC-STATUS",
    product,
    status,
    currency: "INR",
    totalMinor: product === "HOTEL" ? "1840000" : "654000",
    paymentStatus: "CAPTURED",
    createdAt: new Date().toISOString(),
    itinerary: product === "HOTEL"
      ? { hotelName: "Synthetic Goa Stay", checkIn: departure, checkOut: returning, rooms: [{ adults: 2, children: 1 }, { adults: 2 }] }
      : { from: "BOM", to: "DEL", date: departure, adults: 1 },
    supplierBookingId: "SUPPLIER-SYNTHETIC-STATUS",
    hotelName: product === "HOTEL" ? "Synthetic Goa Stay" : null,
    passengers: product === "FLIGHT" ? [{ name: "Synthetic Traveller", pnrs: ["TESTPNR"], tickets: ["TEST-TICKET"] }] : [{ name: "Synthetic Guest", pnrs: [], tickets: [] }],
    refunds: [],
  };
}

for (const product of ["FLIGHT", "HOTEL"] as const) {
  test(`${product} status separates captured payment from supplier confirmation and updates automatically`, async ({ page, provider }, testInfo) => {
    await page.clock.install({ time: new Date() });
    provider.overrides[detailsKey] = { body: details(product) };
    await page.goto(statusPath);
    await expect(page.getByRole("heading", { level: 1, name: "We’re confirming your booking." })).toBeVisible();
    const progress = page.getByRole("region", { name: "Payment and confirmation progress" });
    await expect(progress.getByRole("heading", { name: "Payment received", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download confirmation PDF" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Supplier confirmation", exact: true })).toHaveCount(0);
    await expect(page.getByText("TEST-TICKET", { exact: true })).toHaveCount(0);
    const summary = page.getByRole("complementary", { name: "Your booking summary" });
    await expect(summary).toContainText("MT-SYNTHETIC-STATUS");
    await expect(summary).toContainText(product === "HOTEL" ? "Synthetic Goa Stay" : "BOM → DEL");
    await expect(summary).toContainText(product === "HOTEL" ? "18,400" : "6,540");
    if (product === "HOTEL") await expect(summary).toContainText("2 rooms · 5 guests");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(provider.calls.filter(call => call.method !== "GET")).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `booking-status-${product.toLowerCase()}-pending`);

    provider.overrides[detailsKey] = { body: details(product, product === "HOTEL" ? "CONFIRMED" : "TICKETED") };
    await page.clock.fastForward(5_000);
    await expect(page.getByRole("heading", { level: 1, name: product === "HOTEL" ? "Your stay is confirmed." : "Your flight is ticketed." })).toBeVisible();
    const confirmation = page.getByRole("region", { name: "Supplier confirmation", exact: true });
    await expect(confirmation).toContainText("SUPPLIER-SYNTHETIC-STATUS");
    if (product === "FLIGHT") {
      await expect(confirmation).toContainText("TESTPNR");
      await expect(confirmation).toContainText("TEST-TICKET");
    }
    if (product === "HOTEL") {
      await expect(confirmation).toContainText("Synthetic Guest");
      await expect(confirmation).toContainText("2 rooms · 5 guests");
      await expect(confirmation).not.toContainText(/PNR:|Ticket:|Awaiting supplier reference/);
    }
    await expect(confirmation.getByRole("link", { name: "Download confirmation PDF" })).toHaveAttribute("href", `/api/bookings/${bookingId}/document`);
    await expect(summary).toContainText("MT-SYNTHETIC-STATUS");
    expect(provider.requests(detailsPath).length).toBeGreaterThanOrEqual(2);
    expect(provider.calls.filter(call => call.method !== "GET")).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `booking-status-${product.toLowerCase()}-confirmed`);
  });
}

test("a failed refresh preserves clearly labelled last-known details and then recovers", async ({ page, provider }) => {
  await page.clock.install({ time: new Date() });
  provider.overrides[detailsKey] = { body: details() };
  await page.goto(statusPath);
  await expect(page.getByRole("heading", { level: 1, name: "We’re confirming your booking." })).toBeVisible();
  provider.overrides[detailsKey] = { status: 503, body: { error: "Synthetic temporary failure" } };
  await page.clock.fastForward(5_000);
  const notice = page.locator(".booking-status-page").getByRole("alert");
  await expect(notice).toContainText("Your last checked details remain below");
  await expect(notice).toContainText("does not mean payment or booking failed");
  await expect(page.getByRole("complementary", { name: "Your booking summary" })).toContainText("MT-SYNTHETIC-STATUS");
  await expect(page.getByRole("link", { name: "Download confirmation PDF" })).toHaveCount(0);
  provider.overrides[detailsKey] = { body: details("FLIGHT", "TICKETED") };
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your flight is ticketed." })).toBeVisible();
  await expect(page.locator(".booking-status-page").getByRole("alert")).toHaveCount(0);
  expect(provider.requests("/api/payments/create")).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
});

for (const status of [401, 403]) {
  test(`status access loss ${status} clears private details and stops polling`, async ({ page, provider }) => {
    await page.clock.install({ time: new Date() });
    provider.overrides[detailsKey] = { body: details() };
    await page.goto(statusPath);
    await expect(page.getByRole("complementary", { name: "Your booking summary" })).toContainText("MT-SYNTHETIC-STATUS");
    provider.overrides[detailsKey] = { status, body: { error: "Synthetic access revoked" } };
    await page.clock.fastForward(5_000);
    await expect(page.getByRole("link", { name: "Open account", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open account", exact: true })).toHaveAttribute("href", `/account?returnTo=${encodeURIComponent(statusPath)}`);
    await expect(page.getByRole("complementary", { name: "Your booking summary" })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("MT-SYNTHETIC-STATUS");
    await expect(page.locator("main")).not.toContainText("6,540");
    await expect(page.getByRole("link", { name: "Download confirmation PDF" })).toHaveCount(0);
    const requestCount = provider.requests(detailsPath).length;
    await page.clock.fastForward(15_000);
    expect(provider.requests(detailsPath)).toHaveLength(requestCount);
    expect(provider.calls.filter(call => call.method !== "GET")).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
}

test("an unavailable or foreign booking gets a generic private response without a payment action", async ({ page, provider }) => {
  provider.overrides[detailsKey] = { status: 404, body: { error: "Record not found." } };
  await page.goto(statusPath);
  await expect(page.getByRole("heading", { level: 1, name: "We couldn’t find this booking." })).toBeVisible();
  await expect(page.locator(".booking-status-page").getByRole("alert")).toContainText("unavailable for this account");
  await expect(page.getByRole("complementary", { name: "Your booking summary" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Get booking support", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download confirmation PDF" })).toHaveCount(0);
  expect(provider.requests("/api/payments/create")).toHaveLength(0);
  expect(provider.calls.filter(call => call.method !== "GET")).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test("signed-out access preserves this booking as the sign-in return and fetches no private details", async ({ page, provider }) => {
  provider.session = null;
  await page.goto(statusPath);
  await expect(page.getByRole("link", { name: "Sign in to view booking", exact: true })).toHaveAttribute("href", `/account?returnTo=${encodeURIComponent(statusPath)}`);
  await expect(page.getByRole("complementary", { name: "Your booking summary" })).toHaveCount(0);
  expect(provider.requests(detailsPath)).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
});

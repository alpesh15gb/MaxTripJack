import { test, expect, bookingId, departure, returning, capture, expectNoHorizontalOverflow } from "./fixtures";
import path from "node:path";
import type { BookingStatusDetails } from "../../src/lib/booking-status";

const detailsPath = `/api/bookings/${bookingId}/details`;
const detailsKey = `GET ${detailsPath}`;
const statusPath = `/my-trips/${bookingId}`;

function details(product: "FLIGHT" | "HOTEL" = "FLIGHT", status = "BOOKING_PENDING"): BookingStatusDetails {
  const stay = product === "HOTEL" && status === "CONFIRMED" ? {
    property: { amenities: [], address: "Synthetic Goa Road", photos: Array.from({length:3}, (_, index)=>({
      url:`https://i.travelapi.com/lodging/123/synthetic-voucher-${index}.jpg`, isHero:index===0,
    })) }, rooms: ["Garden room"], meal: "Breakfast", inclusions: ["Breakfast for booked guests"],
  } : undefined;
  return {
    stay,
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
    passengers: product === "FLIGHT" ? [{ name: "Synthetic Traveller", pnrs: ["TESTPNR"], tickets: ["TEST-TICKET"] }] : [{ name: "Synthetic Guest", pnrs: [], tickets: [], roomIndex: 1 }],
    refunds: [],
  };
}

for (const product of ["FLIGHT", "HOTEL"] as const) {
  test(`${product} status separates captured payment from supplier confirmation and updates automatically`, async ({ page, provider }, testInfo) => {
    await page.clock.install({ time: new Date() });
    if (product === "HOTEL") await page.route("https://i.travelapi.com/lodging/123/synthetic-voucher-*.jpg", route => route.fulfill({
      contentType:"image/jpeg",path:path.resolve("public/travel/goa.jpg"),
    }));
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
      await expect(confirmation).toContainText("Garden room");
      await expect(confirmation).toContainText("Breakfast for booked guests");
      await expect(confirmation.getByRole("img")).toHaveCount(await page.evaluate(()=>matchMedia("(max-width:700px)").matches)?1:3);
      await expect(confirmation).toContainText("Synthetic Guest");
      await expect(confirmation).toContainText("Room 2 · Guest on this stay");
      await expect(confirmation).toContainText("2 rooms · 5 guests");
      await expect(confirmation).not.toContainText(/PNR:|Ticket:|Awaiting supplier reference/);
    }
    await expect(confirmation.getByRole("link", { name: "Download confirmation PDF" })).toHaveAttribute("href", `/api/bookings/${bookingId}/document`);
    await expect(summary).toContainText("MT-SYNTHETIC-STATUS");
    expect(provider.requests(detailsPath).length).toBeGreaterThanOrEqual(2);
    expect(provider.calls.filter(call => call.method !== "GET")).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({path:testInfo.outputPath(`booking-confirmation-${product.toLowerCase()}-viewport.png`),animations:'disabled'});
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

test('a confirmed reservation without ticket numbers offers a booking record and direct after-sales',async({page,provider},info)=>{
  const reservation = details('FLIGHT','TICKETED');
  reservation.passengers[0].tickets=[];
  provider.overrides[detailsKey]={body:reservation};
  const cancellation = `/api/bookings/${bookingId}/cancellation-offer`;
  provider.overrides[`GET ${cancellation}`]={body:{requests:[]}};
  if(info.project.name.includes('mobile')) await page.setViewportSize({width:320,height:760});
  await page.goto(statusPath);
  await expect(page.getByRole('heading',{level:1,name:'Your flight booking is confirmed.'})).toBeVisible();
  const confirmation = page.getByRole('region',{name:'Supplier confirmation'});
  await expect(confirmation.getByRole('link',{name:'Download booking record (PDF)',exact:true})).toHaveAttribute('href',`/api/bookings/${bookingId}/document`);
  await expect(confirmation.getByRole('link',{name:'Download confirmation PDF',exact:true})).toHaveCount(0);
  expect(provider.requests(cancellation)).toHaveLength(0);
  const management = page.getByRole('region',{name:'Manage this booking',exact:true});
  await management.getByText('Changes, cancellation & refund updates',{exact:true}).click();
  await expect(management.getByText('No cancellation request for this booking.',{exact:true})).toBeVisible();
  await expect(management.getByRole('button',{name:'Request cancellation terms',exact:true})).toBeVisible();
  if(info.project.name.includes('mobile')){
    await page.evaluate(()=>document.fonts.ready);
    for(const [name,panel] of [
      ['Request cancellation terms','.trip-cancellation-request'],
      ['Refresh cancellation progress','.private-cancellation-progress'],
    ]){
      const control=(await management.getByRole('button',{name,exact:true}).boundingBox())!;
      const card=(await management.locator(panel).boundingBox())!;
      expect(control.x).toBeGreaterThanOrEqual(card.x);
      expect(control.x+control.width).toBeLessThanOrEqual(card.x+card.width);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(provider.requests(cancellation).map(call=>call.method)).toEqual(['GET']);
  expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  await capture(page,info,'booking-status-after-sales');
});

for (const status of [401, 403]) {
  test(`status access loss ${status} clears private details and stops polling`, async ({ page, provider }) => {
    await page.clock.install({ time: new Date() });
    provider.overrides[detailsKey] = { body: details() };
    await page.goto(statusPath);
    await expect(page.getByRole("complementary", { name: "Your booking summary" })).toContainText("MT-SYNTHETIC-STATUS");
    provider.overrides[detailsKey] = { status, body: { error: "Synthetic access revoked" } };
    await page.clock.fastForward(5_000);
    const accessLink = page.getByRole("link", { name: status === 401 ? "Sign in to view booking" : "Open account", exact: true });
    await expect(accessLink).toBeVisible();
    await expect(accessLink).toHaveAttribute("href", `/account?returnTo=${encodeURIComponent(statusPath)}`);
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

test("signed-out access without a guest booking offers sign-in with this booking as the return", async ({ page, provider }) => {
  provider.session = null;
  // Not owned by this browser's guest session: the server refuses and nothing private is shown.
  provider.overrides[detailsKey] = { status: 401, body: { error: "Sign in to continue." } };
  await page.goto(statusPath);
  await expect(page.getByRole("link", { name: "Sign in to view booking", exact: true })).toHaveAttribute("href", `/account?returnTo=${encodeURIComponent(statusPath)}`);
  await expect(page.getByRole("complementary", { name: "Your booking summary" })).toHaveCount(0);
  expect(provider.requests(detailsPath)).toHaveLength(1);
  await expectNoHorizontalOverflow(page);
});

test("a guest who booked in this browser sees the booking status without signing in", async ({ page, provider }) => {
  provider.session = null;
  provider.overrides[detailsKey] = { body: details() };
  await page.goto(statusPath);
  await expect(page.getByRole("link", { name: "Sign in to view booking", exact: true })).toHaveCount(0);
  await expect(page.getByText(details().reference, { exact: false }).first()).toBeVisible();
});

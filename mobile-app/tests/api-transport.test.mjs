import assert from "node:assert/strict";
import test from "node:test";
import { ApiHttpError, checkedApiOrigin, requestJson } from "../src/api-transport.ts";

test("native API configuration requires a clean HTTPS origin for signed builds", () => {
  assert.equal(checkedApiOrigin(" https://booking.example.com/ ", false), "https://booking.example.com");
  assert.equal(checkedApiOrigin(undefined, true), "http://127.0.0.1:3000");
  for (const value of [
    undefined, "http://booking.example.com", "https://booking.example.com/api",
    "https://booking.example.com/?query=value", "https://user@booking.example.com",
  ]) assert.throws(() => checkedApiOrigin(value, false));
});

test("native transport retains authorization status for non-JSON responses", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Denied</html>", {
    status: 403, headers: { "Content-Type": "text/html" },
  }));
  await assert.rejects(requestJson("https://booking.example.com/api/bookings", {}), error => (
    error instanceof ApiHttpError && error.status === 403 && !error.hasServerError &&
    !error.message.includes("html")
  ));
});

test("native transport separates structured API rejections from unreadable success responses", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: "Check the quoted price.", code: "PRICE_REVIEW_REQUIRED",
  }, { status: 409 })).mock.mockImplementationOnce(async () => new Response("", { status: 200 }));
  await assert.rejects(requestJson("https://booking.example.com/api/payments/create", {}), /unexpected response/);
  await assert.rejects(requestJson("https://booking.example.com/api/payments/create", {}), error => (
    error instanceof ApiHttpError && error.status === 409 && error.hasServerError &&
    error.code === "PRICE_REVIEW_REQUIRED"
  ));
});

test("native transport times out and forwards navigation cancellation", async t => {
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }));
  await assert.rejects(requestJson("https://booking.example.com/api/health", {}, undefined, 5), /timed out/);
  const controller = new AbortController();
  const request = requestJson("https://booking.example.com/api/health", {}, controller.signal);
  controller.abort();
  await assert.rejects(request, /aborted/);
});

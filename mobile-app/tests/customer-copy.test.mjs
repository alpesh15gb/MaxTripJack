import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile search, checkout and cancellation use customer-safe testing copy", () => {
  const source=readFileSync(new URL("../App.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/TripJack|\bUAT\b|production bookings?|test environment/i);
  assert.match(source,/description:"In Testing"/);
  assert.equal(source.split("In Testing · No live bookings or payments").length-1,2);
  assert.match(source,/Travel remains active until cancellation is confirmed/);
});

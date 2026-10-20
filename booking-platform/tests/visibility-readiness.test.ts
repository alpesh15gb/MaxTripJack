import test from "node:test";
import assert from "node:assert/strict";
import { formatInrMinor, VISIBILITY_BASELINES, VISIBILITY_CONNECTIONS } from "../src/lib/visibility-readiness";

test("unknown visibility baselines stay null, never fabricated zero traffic", () => {
  assert.ok(VISIBILITY_BASELINES.length > 0);
  for (const metric of VISIBILITY_BASELINES) assert.equal(metric.value, null);
  assert.equal(VISIBILITY_BASELINES.find(metric => metric.metric.includes("LCP"))?.target, "≤ 2.5 seconds");
  assert.equal(VISIBILITY_BASELINES.find(metric => metric.metric.includes("conversion"))?.target, null);
  for (const connection of VISIBILITY_CONNECTIONS) assert.match(connection.status, /^Not (connected|configured)/);
});

test("ledger display preserves exact integer paise, including totals beyond JS safe integers", () => {
  assert.equal(formatInrMinor("0"), "₹0.00");
  assert.equal(formatInrMinor("1"), "₹0.01");
  assert.equal(formatInrMinor("125000"), "₹1,250.00");
  assert.equal(formatInrMinor("900719925474099199"), "₹9,00,71,99,25,47,40,991.99");
  for (const value of ["-1", "1.5", "NaN", "", "100 INR", "1e10"]) assert.throws(() => formatInrMinor(value));
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildLlmsTxt } from "../src/lib/llms";

const live = { NODE_ENV: "production", SEO_INDEXING_ENABLED: "true", SEO_SITE_ORIGIN: "https://maxtravel.in" };

test("llms.txt is withheld until indexing is enabled", () => {
  assert.equal(buildLlmsTxt({ NODE_ENV: "production" }), null);
});

test("llms.txt lists owner-confirmed contact, pages and route guides without prices", () => {
  const text = buildLlmsTxt(live) ?? "";
  assert.match(text, /^# MaxTravel/);
  assert.match(text, /Secunderabad/);
  assert.match(text, /https:\/\/maxtravel\.in\/flights\/hyderabad-to-dubai/);
  assert.match(text, /https:\/\/maxtravel\.in\/contact/);
  assert.doesNotMatch(text, /₹|\bINR\b|\bRs\.?\s?\d/);
});

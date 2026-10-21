/**
 * Real production-HTML checks, no browser or live services.
 * Run after `npm run build`: node --import tsx scripts/verify-seo-http.mjs
 * Starts and fetches its own loopback server in one process tree. The child gets
 * no account/database/provider/payment credentials and never loads .env files.
 * This is not a visual, Core Web Vitals, or production-domain acceptance test.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PUBLIC_SEO_PAGES } from "../src/lib/seo-registry.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://maxtravel.in";
const privatePaths = ["/book", "/account", "/my-trips", "/travellers", "/operations", "/operations/visibility", "/reset-password?token=synthetic-secret-do-not-index"];
const publicPaths = PUBLIC_SEO_PAGES.map(page => page.path);
let assertions = 0;

function check(condition, message) { assert.ok(condition, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function decode(value) { return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">"); }
function attrs(tag) { return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(match => [match[1].toLowerCase(), decode(match[2])])); }
function tags(html, name) { return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(match => attrs(match[0])); }
function cleanText(html) { return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()); }
function contents(html, name) { return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi"))].map(match => cleanText(match[1])); }
function robotsValues(html) { return tags(html, "meta").filter(tag => tag.name === "robots").map(tag => tag.content); }
function canonicalValues(html) { return tags(html, "link").filter(tag => tag.rel === "canonical").map(tag => tag.href); }
function jsonLd(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => attrs(match[1]).type === "application/ld+json")
    .map(match => {
      check(!match[2].includes("<"), "Actual JSON-LD tag must not contain script-closing markup");
      return JSON.parse(match[2]);
    });
}
function inspectSchema(value) {
  if (Array.isArray(value)) { value.forEach(inspectSchema); return; }
  if (!value || typeof value !== "object") return;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  for (const type of types) check(!["Offer", "AggregateOffer", "AggregateRating", "Review", "Flight"].includes(type), `No invented public ${type} schema`);
  for (const key of ["offers", "price", "lowPrice", "highPrice", "priceRange", "aggregateRating", "review", "reviewCount"]) {
    check(!(key in value), `No unapproved public schema field ${key}`);
  }
  Object.values(value).forEach(inspectSchema);
}
function inspectDocument(response, html, label) {
  equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${label}: loopback/preview always noindex`);
  check(response.headers.get("cache-control")?.includes("no-store"), `${label}: document not shared-cacheable`);
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  check(Boolean(nonce), `${label}: document has CSP nonce`);
  const scriptPolicy = policy.split(";").find(part => part.trim().startsWith("script-src")) ?? "";
  check(scriptPolicy.includes("'strict-dynamic'"), `${label}: strict-dynamic preserved`);
  check(!scriptPolicy.includes("'unsafe-inline'") && !scriptPolicy.includes("'unsafe-eval'"), `${label}: no executable inline/eval relaxation`);
  const scripts = tags(html, "script");
  check(scripts.length > 0, `${label}: SSR script tags observed`);
  for (const script of scripts) equal(script.nonce, nonce, `${label}: every actual script tag matches request nonce`);
  equal(response.headers.get("x-frame-options"), "DENY", `${label}: clickjacking header`);
  equal(response.headers.get("x-content-type-options"), "nosniff", `${label}: content-type protection`);
  return nonce;
}

async function unusedPort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function withServer(settings, run) {
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ...settings };
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  const record = data => { logs = (logs + data.toString()).slice(-20_000); };
  child.stdout.on("data", record); child.stderr.on("data", record);
  const request = async path => {
    check(path.startsWith("/") && !path.startsWith("//"), "Fetches only local authored paths");
    return fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  };
  try {
    const deadline = Date.now() + 90_000;
    while (true) {
      if (child.exitCode !== null) throw new Error(`Local Next server exited ${child.exitCode}: ${logs}`);
      try { if ((await request("/robots.txt")).status === 200) break; } catch { /* Startup only. */ }
      if (Date.now() >= deadline) throw new Error(`Local server did not become ready: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    await run(request);
    // Server-rendered editorial pages must not attempt supplier or DB access.
    check(!/DATABASE_URL|ECONNREFUSED|TripJack.*request|database is not configured/i.test(logs), "Public SSR made no accidental database/provider dependency request");
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const hardStop = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(hardStop);
    }
  }
}

check(existsSync(new URL("../.next/BUILD_ID", import.meta.url)), "Run npm run build first");
// Next loads local .env files itself. Fail closed instead of inheriting secrets
// or touching an operator's files to suppress the loader.
for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  check(!existsSync(new URL(`../${file}`, import.meta.url)), `Refusing to launch against ${file}; use a credential-free test checkout`);
}

await withServer({ SEO_INDEXING_ENABLED: "false", SEO_SITE_ORIGIN: origin }, async request => {
  const robots = await request("/robots.txt");
  const robotsText = await robots.text();
  equal(robots.status, 200, "Default-off robots status");
  check(/^Disallow: \/$/m.test(robotsText) && !/^Allow:/m.test(robotsText), "Default-off robots disallows all");
  const sitemap = await request("/sitemap.xml");
  const sitemapText = await sitemap.text();
  equal(sitemap.status, 200, "Default-off sitemap status");
  check(!/<loc>/.test(sitemapText), "Default-off sitemap has zero URLs");
  const titles = new Set(), headings = new Set(), descriptions = new Set();
  let previousNonce;
  for (const path of publicPaths) {
    const response = await request(path); const html = await response.text();
    equal(response.status, 200, `${path}: authored page status`);
    const nonce = inspectDocument(response, html, path);
    check(nonce !== previousNonce, `${path}: fresh nonce per response`); previousNonce = nonce;
    const title = contents(html, "title"); const h1 = contents(html, "h1");
    equal(title.length, 1, `${path}: exactly one title`); equal(h1.length, 1, `${path}: exactly one H1`);
    check(!titles.has(title[0]), `${path}: unique title`); titles.add(title[0]);
    check(!headings.has(h1[0]), `${path}: unique H1`); headings.add(h1[0]);
    const description = tags(html, "meta").filter(tag => tag.name === "description");
    equal(description.length, 1, `${path}: exactly one meta description`);
    check(Boolean(description[0].content) && !descriptions.has(description[0].content), `${path}: useful unique description`); descriptions.add(description[0].content);
    const canonicals = canonicalValues(html); equal(canonicals.length, 1, `${path}: exactly one canonical`);
    // Next omits the cosmetic trailing slash from the root canonical. Compare
    // parsed URLs so / and the empty root path remain the same resource.
    equal(new URL(canonicals[0]).href, new URL(origin + path).href, `${path}: self canonical`);
    check(robotsValues(html).some(value => value.includes("noindex")), `${path}: UAT meta noindex`);
    const schemas = jsonLd(html); check(schemas.length > 0, `${path}: JSON-LD server-rendered`); schemas.forEach(inspectSchema);
    check(!/(?:₹|INR\s*)\s*[0-9][0-9,]*(?:\.[0-9]+)?/.test(cleanText(html)), `${path}: no invented public fare`);
    check(!/guaranteed (?:lowest|cheapest|first.place)|\b\d[\d,]*\s+(?:happy customers|verified reviews)\b/i.test(cleanText(html)), `${path}: no unsupported superlatives/testimonials`);
    if (path === "/") {
      const hero = tags(html, "img").find(tag => (tag.class ?? "").split(" ").includes("home-escape-photo"));
      check(Boolean(hero), "Homepage editorial photo is an actual responsive image");
      check(Boolean(hero.srcset) && hero.sizes === "(max-width: 1280px) 100vw, 1200px", "Homepage editorial photo has responsive candidates and declared sizes");
      check(hero.loading === "lazy", "Below-search editorial photo is lazy loaded");
      check(!tags(html, "link").some(tag => tag.rel === "preload" && tag.as === "image"), "Below-search imagery does not compete with the search-first initial render");
    }
    if (["/contact", "/office", "/about"].includes(path)) {
      check(cleanText(html).includes("Secunderabad"), `${path}: correct India office identity`);
      check(cleanText(html).includes("500003"), `${path}: correct office postcode`);
      const serialized = JSON.stringify(schemas);
      check(serialized.includes('"opens":"09:00"') && serialized.includes('"closes":"21:00"'), `${path}: actual schema office hours`);
      for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) check(serialized.includes(`https://schema.org/${day}`), `${path}: opens ${day}`);
    }
  }
  for (const path of privatePaths) {
    const response = await request(path); const html = await response.text();
    inspectDocument(response, html, path);
    check([200, 307].includes(response.status), `${path}: protected page/safe redirect`);
    if (response.status === 200) check(robotsValues(html).some(value => value.includes("noindex")), `${path}: private meta noindex`);
    check(!canonicalValues(html).some(value => value.includes("?")), `${path}: token-free canonical`);
    check(!/<[^>]+(?:href|content)="[^"]*synthetic-secret-do-not-index/.test(html), `${path}: token absent from metadata/links`);
  }
  for (const path of ["/flights/this-route-is-not-authored", "/totally-unknown-public-page"]) {
    const response = await request(path); const html = await response.text();
    equal(response.status, 404, `${path}: true HTTP 404, not soft 200`);
    equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${path}: 404 header noindex`);
    check(robotsValues(html).some(value => value.includes("noindex")), `${path}: 404 meta noindex`);
  }
  const api = await request("/api/admin/visibility");
  check([401, 403, 503].includes(api.status), "Unauthenticated visibility API is denied without credentials");
  equal(api.headers.get("x-robots-tag"), "noindex, nofollow", "Private API noindex header");
  check(api.headers.get("cache-control")?.includes("no-store"), "Private API never shared cached");
  console.log(`PASS: default-off SSR for ${publicPaths.length} public pages, ${privatePaths.length} private routes, 404s, office identity, schemas and CSP.`);
});

await withServer({ SEO_INDEXING_ENABLED: "true", SEO_SITE_ORIGIN: origin }, async request => {
  const robots = await request("/robots.txt"); const text = await robots.text();
  check(/^Allow: \/$/m.test(text) && /^Disallow: \/api\/$/m.test(text), "Approved gate enables general search but not private APIs");
  check(text.includes("User-Agent: GPTBot") && text.includes("User-Agent: Google-Extended"), "Training remains separate and off by default");
  const sitemap = await request("/sitemap.xml"); const xml = await sitemap.text();
  equal(sitemap.status, 200, "Approved-gate sitemap HTTP status");
  check((sitemap.headers.get("content-type") ?? "").includes("xml"), "Actual sitemap response is XML");
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
  assert.deepEqual(locations, publicPaths.map(path => origin + path)); assertions += 1;
  for (const location of locations) { equal(new URL(location).search, "", "Sitemap never contains query URLs"); check(!privatePaths.some(path => location === origin + path), "Sitemap excludes private URLs"); }
  for (const path of ["/flights", "/flights?token=synthetic-secret-do-not-index"]) {
    const response = await request(path); const html = await response.text();
    equal(response.status, 200, `${path}: enabled-gate SSR status`);
    inspectDocument(response, html, path);
    check(robotsValues(html).some(value => /(?:^|,\s*)index(?:,|$)/.test(value) && /(?:^|,\s*)follow(?:,|$)/.test(value)), "Approved configuration changes actual public meta robots; preview/query header remains the stricter noindex control");
    equal(canonicalValues(html)[0], origin + "/flights", "Query token excluded from canonical");
    check(!tags(html, "meta").some(tag => (tag.content ?? "").includes("synthetic-secret-do-not-index")), "No token in actual meta tags");
  }
  console.log("PASS: approved production gate emits exact 18-URL XML allowlist; actual preview/query responses still deny indexing.");
});

await withServer({ SEO_INDEXING_ENABLED: "true", SEO_SITE_ORIGIN: "https://preview.example" }, async request => {
  check(/^Disallow: \/$/m.test(await (await request("/robots.txt")).text()), "Wrong configured origin fails closed");
  check(!/<loc>/.test(await (await request("/sitemap.xml")).text()), "Wrong-origin sitemap stays empty");
  const response = await request("/flights"); const html = await response.text();
  inspectDocument(response, html, "wrong-origin /flights");
  check(robotsValues(html).some(value => value.includes("noindex")), "Wrong configured origin emits meta noindex");
  console.log("PASS: wrong canonical-origin configuration fails closed in actual HTTP responses.");
});
console.log(`PASS: ${assertions} HTTP/HTML assertions. No browser, provider transaction, account, database or external service used.`);

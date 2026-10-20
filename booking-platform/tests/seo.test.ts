import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { businessProfile, businessStructuredData, officeDirectionsHref } from "../src/lib/business-profile";
import { flightGuides, flightGuideSearchHref, getFlightGuide } from "../src/lib/flight-guides";
import { publicPages } from "../src/lib/public-pages";
import { PUBLIC_SEO_PAGES, isPublicSeoPath } from "../src/lib/seo-registry";
import {
  SITE_ORIGIN, buildRobots, buildSitemap, canonicalUrl, indexingEnabled,
  pageMetadata, privatePageMetadata, requestMayBeIndexed, serializeJsonLd, siteRobots,
} from "../src/lib/seo";

const approved = { NODE_ENV: "production", SEO_INDEXING_ENABLED: "true", SEO_SITE_ORIGIN: SITE_ORIGIN };
const privatePaths = ["/book", "/account", "/my-trips", "/travellers", "/operations", "/operations/visibility", "/reset-password", "/api/admin/visibility"];

function withSeoEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
  const environment = process.env as Record<string, string | undefined>;
  const before = Object.fromEntries(Object.keys(values).map(key => [key, environment[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete environment[key]; else environment[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete environment[key]; else environment[key] = value;
    }
  }
}

test("production builds alone are never an indexing approval", () => {
  for (const environment of [{}, { NODE_ENV: "production" }, { ...approved, NODE_ENV: "development" },
    { ...approved, SEO_INDEXING_ENABLED: "false" }, { ...approved, SEO_INDEXING_ENABLED: "TRUE" },
    { ...approved, SEO_SITE_ORIGIN: undefined }, { ...approved, SEO_SITE_ORIGIN: "https://www.maxtravel.in" },
    { ...approved, SEO_SITE_ORIGIN: "https://maxtravel.in/" }, { ...approved, SEO_SITE_ORIGIN: "https://preview.example" }]) {
    assert.equal(indexingEnabled(environment), false);
    assert.deepEqual(siteRobots(environment), { index: false, follow: false });
    assert.deepEqual(buildSitemap(environment), []);
    assert.deepEqual(buildRobots(environment), { rules: { userAgent: "*", disallow: "/" } });
  }
  assert.equal(indexingEnabled(approved), true);
  assert.deepEqual(siteRobots(approved), { index: true, follow: true });
});

test("canonicals are HTTPS owner-origin, clean paths, never request URLs or tokens", () => {
  assert.equal(canonicalUrl("/"), "https://maxtravel.in/");
  assert.equal(canonicalUrl("/flights/?token=secret&from=HYD#private"), "https://maxtravel.in/flights");
  assert.equal(canonicalUrl("/flights//hyderabad-to-delhi/"), "https://maxtravel.in/flights/hyderabad-to-delhi");
  for (const path of ["https://evil.example/flights", "//evil.example", "flights", "/\\evil.example", "/bad\npath", "/has space"]) {
    assert.throws(() => canonicalUrl(path));
  }
});

test("request indexing requires canonical origin, public path and no query variants", () => {
  assert.equal(requestMayBeIndexed(new URL(`${SITE_ORIGIN}/flights`), approved), true);
  for (const url of ["http://maxtravel.in/flights", "https://www.maxtravel.in/flights", "https://preview.example/flights", "http://127.0.0.1:3100/flights",
    `${SITE_ORIGIN}/flights?token=synthetic-secret`, `${SITE_ORIGIN}/?session=synthetic-secret`, `${SITE_ORIGIN}/flights?from=HYD&to=DEL`,
    `${SITE_ORIGIN}/flights/not-an-authored-route`, ...privatePaths.map(path => SITE_ORIGIN + path)]) {
    assert.equal(requestMayBeIndexed(new URL(url), approved), false, url);
  }
  assert.equal(requestMayBeIndexed(new URL(`${SITE_ORIGIN}/flights`), {}), false);
});

test("sitemap is exactly 18 substantial reviewed public pages, with no query/private URL", () => {
  assert.equal(PUBLIC_SEO_PAGES.length, 18);
  assert.equal(new Set(PUBLIC_SEO_PAGES.map(page => page.path)).size, 18);
  const sitemap = buildSitemap(approved);
  assert.deepEqual(sitemap.map(entry => entry.url), PUBLIC_SEO_PAGES.map(page => canonicalUrl(page.path)));
  for (const entry of sitemap) {
    const url = new URL(entry.url);
    assert.equal(url.origin, SITE_ORIGIN);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.ok(isPublicSeoPath(url.pathname));
    assert.equal(entry.lastModified, "2026-10-20", "Use reviewed content date, not every request time");
  }
  for (const path of privatePaths) assert.equal(isPublicSeoPath(path), false);
});

test("production robots keeps search distinct from optional training and private API access", () => {
  const robots = buildRobots(approved);
  assert.equal(robots.sitemap, `${SITE_ORIGIN}/sitemap.xml`);
  assert.ok(Array.isArray(robots.rules));
  const rules = robots.rules as Array<{ userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] }>;
  assert.deepEqual(rules[0], { userAgent: "*", allow: "/", disallow: "/api/" });
  for (const rule of rules.slice(1)) {
    assert.equal(rule.allow, undefined, "Specific bots must not bypass generic exclusions");
    assert.equal(rule.disallow, "/");
  }
  assert.equal((buildRobots({ ...approved, SEO_AI_TRAINING_ENABLED: "true" }).rules as unknown[]).length, 1);
});

test("public metadata has its own clean canonical while private metadata always denies indexing", () => {
  withSeoEnvironment(approved, () => {
    const publicPage = pageMetadata("/flights?token=synthetic-secret", "Flight search guide", "Compare a complete itinerary before booking.");
    assert.equal(publicPage.alternates?.canonical, `${SITE_ORIGIN}/flights`);
    assert.deepEqual(publicPage.robots, { index: true, follow: true });
    assert.deepEqual(pageMetadata("/account", "Account", "Private account").robots, { index: false, follow: false });
    assert.deepEqual(privatePageMetadata("My trips").robots, { index: false, follow: false });
    assert.deepEqual(privatePageMetadata("Booking", true).robots, { index: false, follow: true });
  });
});

test("JSON-LD safely escapes script termination and Unicode separators and preserves data", () => {
  const data = { "@type": "WebPage", name: "</script><script>bad()</script>", description: "left\u2028middle\u2029right" };
  const escaped = serializeJsonLd(data);
  assert.equal(escaped.includes("<"), false);
  assert.equal(escaped.includes("\u2028"), false);
  assert.equal(escaped.includes("\u2029"), false);
  assert.ok(escaped.includes("\\u003c/script>"));
  assert.deepEqual(JSON.parse(escaped), data);
});

test("proxy sends noindex on every UAT/private/query document without weakening CSP", () => {
  withSeoEnvironment({ ...approved, SEO_INDEXING_ENABLED: "false" }, () => {
    const first = proxy(new NextRequest(`${SITE_ORIGIN}/flights`));
    const second = proxy(new NextRequest(`${SITE_ORIGIN}/flights`));
    assert.equal(first.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(first.headers.get("cache-control") ?? "", /no-store/);
    assert.match(first.headers.get("content-security-policy") ?? "", /'nonce-[^']+'/);
    assert.doesNotMatch(first.headers.get("content-security-policy") ?? "", /'unsafe-eval'/);
    assert.notEqual(first.headers.get("content-security-policy"), second.headers.get("content-security-policy"));
  });
  withSeoEnvironment(approved, () => {
    assert.equal(proxy(new NextRequest(`${SITE_ORIGIN}/flights`)).headers.get("x-robots-tag"), null);
    for (const path of [...privatePaths, "/flights?token=synthetic-secret", "/flights/unknown", "/robots.txt", "/sitemap.xml"]) {
      assert.equal(proxy(new NextRequest(SITE_ORIGIN + path)).headers.get("x-robots-tag"), "noindex, nofollow", path);
    }
    assert.equal(proxy(new NextRequest("https://preview.example/flights")).headers.get("x-robots-tag"), "noindex, nofollow");
  });
});

test("owner-confirmed office is Secunderabad, India, 09:00–21:00 all seven days", () => {
  assert.equal(businessProfile.address.addressLocality, "Secunderabad");
  assert.equal(businessProfile.address.addressRegion, "Telangana");
  assert.equal(businessProfile.address.postalCode, "500003");
  assert.equal(businessProfile.address.addressCountry, "IN");
  assert.equal(businessProfile.phoneE164, "+917095018018");
  assert.equal(businessProfile.email, "max@maxtravel.us");
  assert.equal(businessProfile.hours.timezone, "Asia/Kolkata");
  assert.equal(businessProfile.hours.opens, "09:00");
  assert.equal(businessProfile.hours.closes, "21:00");
  assert.deepEqual(businessProfile.hours.days, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  assert.equal(new URL(officeDirectionsHref).origin, "https://www.google.com");
  assert.match(new URL(officeDirectionsHref).pathname, /^\/maps\/place\/Max\+Travel\//);
  assert.ok(officeDirectionsHref.includes("0x3bcb9b7780ab1f39:0x84c9754247eefedd"), "Exact listing matched by address and telephone, not an unrelated namesake");
  const schema = businessStructuredData();
  assert.deepEqual(schema["@type"], ["Organization", "TravelAgency"]);
  assert.equal(schema.aggregateRating, undefined);
  assert.equal(schema.review, undefined);
  assert.equal(schema.offers, undefined);
  assert.equal(schema.priceRange, undefined);
  assert.equal(schema.geo, undefined);
  assert.equal(schema.hasMap, officeDirectionsHref);
});

test("editorial data and sitemap registry cover exactly the same authored routes", () => {
  const authored = ["/", ...publicPages.map(page => `/${page.slug}`), ...flightGuides.map(page => `/flights/${page.slug}`)];
  assert.deepEqual(authored.sort(), PUBLIC_SEO_PAGES.map(page => page.path).sort());
  assert.equal(new Set([...publicPages, ...flightGuides].map(page => page.title)).size, 17);
  assert.equal(new Set([...publicPages, ...flightGuides].map(page => page.heading)).size, 17);
  assert.equal(new Set([...publicPages, ...flightGuides].map(page => page.description)).size, 17);
  assert.equal(getFlightGuide("this-route-is-not-authored"), undefined);
  assert.equal(getFlightGuide("Hyderabad-to-Delhi"), undefined);
});

test("five guide CTAs prefill the exact verified airport pair without inventory, dates or automatic searches", () => {
  const pairs = {
    "hyderabad-to-delhi": ["HYD", "DEL"], "delhi-to-mumbai": ["DEL", "BOM"],
    "hyderabad-to-dubai": ["HYD", "DXB"], "mumbai-to-goa": ["BOM", "GOI"],
    "delhi-to-bengaluru": ["DEL", "BLR"],
  };
  assert.equal(flightGuides.length, 5);
  for (const guide of flightGuides) {
    assert.deepEqual([guide.origin.code, guide.destination.code], pairs[guide.slug as keyof typeof pairs]);
    const url = new URL(flightGuideSearchHref(guide), SITE_ORIGIN);
    assert.equal(url.pathname, "/book");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["from", "product", "to"]);
    assert.equal(url.searchParams.get("product"), "FLIGHT");
    assert.equal(url.searchParams.get("from"), guide.origin.code);
    assert.equal(url.searchParams.get("to"), guide.destination.code);
    assert.equal(guide.reviewedAt, "2026-10-20");
    assert.ok(guide.sections.length >= 3);
    assert.ok(guide.sources.length >= 2);
    for (const source of guide.sources) assert.equal(new URL(source.href).protocol, "https:");
    for (const slug of guide.relatedSlugs) assert.ok(getFlightGuide(slug), `Broken related guide ${slug}`);
  }
});

test("airport alternatives remain explicitly different, never silent city-code substitutes", () => {
  const goa = JSON.stringify(getFlightGuide("mumbai-to-goa"));
  assert.ok(goa.includes("GOI") && goa.includes("GOX"));
  const mumbai = JSON.stringify(getFlightGuide("delhi-to-mumbai"));
  assert.ok(mumbai.includes("BOM") && mumbai.includes("NMI"));
  const dubai = JSON.stringify(getFlightGuide("hyderabad-to-dubai"));
  assert.ok(dubai.includes("DXB") && dubai.includes("DWC"));
});

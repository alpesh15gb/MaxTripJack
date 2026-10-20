import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicPages, getPublicPage } from "../src/lib/public-pages";
import { flightGuides, getFlightGuide, flightGuideSearchHref } from "../src/lib/flight-guides";
import { businessProfile, businessStructuredData } from "../src/lib/business-profile";
import { PUBLIC_SEO_PAGES } from "../src/lib/seo-registry";
import { canonicalUrl, pageMetadata } from "../src/lib/seo";

test("the content and SEO allowlists contain exactly the same authored paths", () => {
  const paths = ["/", ...publicPages.map(page => `/${page.slug}`), ...flightGuides.map(page => `/flights/${page.slug}`)];
  assert.equal(paths.length, 18);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual([...paths].sort(), PUBLIC_SEO_PAGES.map(page => page.path).sort());
  assert.equal(getPublicPage("not-authored"), undefined);
  assert.equal(getFlightGuide("this-route-is-not-authored"), undefined);
  assert.equal(getFlightGuide("HYDERABAD-TO-DELHI"), undefined);
});

test("every editorial page has distinct useful content and a clean canonical", () => {
  const pages = [...publicPages, ...flightGuides];
  for (const field of ["title", "description", "heading", "intro"] as const) {
    assert.equal(new Set(pages.map(page => page[field])).size, pages.length, `duplicate ${field}`);
  }
  for (const page of pages) {
    assert.ok(page.sections.length >= 3, page.slug);
    const headings = page.sections.map(section => section.heading);
    assert.equal(new Set(headings).size, headings.length);
    assert.equal(page.reviewedAt, "2026-10-20");
    const path = "origin" in page ? `/flights/${page.slug}` : `/${page.slug}`;
    assert.equal(pageMetadata(path, page.title, page.description).alternates?.canonical, canonicalUrl(path));
    assert.equal(new URL(canonicalUrl(path)).search, "");
  }
});

test("route planning CTAs fill only explicit airports, never an itinerary or automatic search", () => {
  assert.equal(flightGuides.length, 5);
  const expected = { "hyderabad-to-delhi": ["HYD", "DEL"], "delhi-to-mumbai": ["DEL", "BOM"], "hyderabad-to-dubai": ["HYD", "DXB"], "mumbai-to-goa": ["BOM", "GOI"], "delhi-to-bengaluru": ["DEL", "BLR"] };
  for (const guide of flightGuides) {
    assert.deepEqual([guide.origin.code, guide.destination.code], expected[guide.slug as keyof typeof expected]);
    const url = new URL(flightGuideSearchHref(guide), businessProfile.website);
    assert.equal(url.pathname, "/book");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["from", "product", "to"]);
    assert.equal(url.searchParams.get("product"), "FLIGHT");
    assert.equal(url.searchParams.get("from"), guide.origin.code);
    assert.equal(url.searchParams.get("to"), guide.destination.code);
    assert.ok(guide.sources.length >= 3);
    for (const source of guide.sources) assert.equal(new URL(source.href).protocol, "https:");
  }
  assert.match(JSON.stringify(getFlightGuide("mumbai-to-goa")), /GOX/);
});

test("business schema keeps owner hours and verified facts without unsupported trust claims", () => {
  const schema = businessStructuredData();
  assert.equal(schema.telephone, "+917095018018");
  assert.equal(schema.email, "max@maxtravel.us");
  assert.deepEqual(schema["@type"], ["Organization", "TravelAgency"]);
  assert.equal(businessProfile.hours.days.length, 7);
  assert.equal(businessProfile.hours.opens, "09:00");
  assert.equal(businessProfile.hours.closes, "21:00");
  assert.equal(schema.hasMap, businessProfile.mapsHref);
  for (const key of ["aggregateRating", "review", "legalName", "award", "priceRange", "offers", "geo"]) assert.equal(schema[key], undefined);
  assert.match(getPublicPage("office")!.sections.map(section => section.paragraphs?.join(" ")).join(" "), /every day, 9:00 am–9:00 pm/);
});

test("public content does not import providers or expose invented price schema", () => {
  for (const path of ["src/lib/public-pages.ts", "src/lib/flight-guides.ts", "src/components/public-content.tsx"]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /from ["'][^"']*(?:providers|supplier-flow|booking-runner|\/db|\/auth)/);
    assert.doesNotMatch(source, /["']@type["']\s*:\s*["'](?:Offer|AggregateOffer|Flight|AggregateRating)["']/);
  }
  const homepage = readFileSync("src/app/page.tsx", "utf8");
  assert.doesNotMatch(homepage, /["']use client["']/);
  assert.match(homepage, /HomePublicIntro/);
  const shell = readFileSync("src/components/travel-shell.tsx", "utf8");
  assert.doesNotMatch(shell, /href=["']\/operations["']/);
  assert.match(shell, /Test environment/);
});

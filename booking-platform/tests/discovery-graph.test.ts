import test from "node:test";
import assert from "node:assert/strict";
import { editorialDiscoveryGraph, homeDiscoveryGraph, websiteStructuredData } from "../src/lib/discovery-graph";
import { businessProfile } from "../src/lib/business-profile";
import { publicPages } from "../src/lib/public-pages";
import { flightGuides } from "../src/lib/flight-guides";
import { canonicalUrl, serializeJsonLd } from "../src/lib/seo";

const root = canonicalUrl("/");

test("homepage declares only the real website and owner-confirmed business, not an inventory search action", () => {
  const graph = homeDiscoveryGraph();
  assert.equal(graph[0]["@type"], "WebSite");
  assert.equal(graph[0].name, businessProfile.name);
  assert.equal(graph[0].url, root);
  assert.equal(graph[1]["@id"], `${root}#organization`);
  assert.deepEqual(websiteStructuredData().publisher, { "@id": graph[1]["@id"] });
  for (const prohibited of ["SearchAction", "potentialAction", "AggregateRating", '"offers"', '"review"']) {
    assert.ok(!serializeJsonLd(graph).includes(prohibited));
  }
});

test("every editorial graph matches visible content and resolves all identity references locally", () => {
  const pages = [...publicPages.map(page => ({ ...page, path: `/${page.slug}`, sources: undefined })),
    ...flightGuides.map(page => ({ ...page, path: `/flights/${page.slug}`, businessSchema: false }))];
  for (const page of pages) {
    const breadcrumbs = [{ label: "Home", href: "/" }, { label: page.heading, href: page.path }];
    const graph = editorialDiscoveryGraph(page, breadcrumbs, { sources: page.sources, fullBusinessProfile: page.businessSchema });
    const ids = new Set(graph.map(node => node["@id"]));
    assert.equal(ids.size, graph.length, page.path);
    const article = graph[0];
    assert.equal(article.name, page.title);
    assert.equal(article.description, page.description);
    assert.equal(article.dateModified, page.reviewedAt);
    assert.equal(article.url, canonicalUrl(page.path));
    assert.deepEqual(article.citation, page.sources?.map(source => ({ "@type": "CreativeWork", name: source.label, url: new URL(source.href).href })));
    function inspect(value: unknown) {
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 1 && "@id" in record) assert.ok(ids.has(record["@id"] as string), `Unresolved reference on ${page.path}`);
      for (const key of ["aggregateRating", "offers", "review", "price", "potentialAction"]) assert.ok(!(key in record));
      Object.values(record).forEach(inspect);
    }
    inspect(graph);
  }
});

test("discovery graph rejects private/query paths, invented trails and unsafe references", () => {
  const page = { path: "/flights", title: "Flights", description: "Planning", reviewedAt: "2026-10-20" };
  const trail = [{ label: "Home", href: "/" }, { label: "Flights", href: "/flights" }];
  for (const path of ["/account", "/flights?token=secret", "//evil.example", "/flights/unknown"]) {
    assert.throws(() => editorialDiscoveryGraph({ ...page, path }, trail));
  }
  assert.throws(() => editorialDiscoveryGraph(page, []));
  assert.throws(() => editorialDiscoveryGraph(page, [trail[0], { label: "Account", href: "/account" }, trail[1]]));
  assert.throws(() => editorialDiscoveryGraph(page, [trail[0], { label: "Office", href: "/office" }]));
  for (const href of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com"]) {
    assert.throws(() => editorialDiscoveryGraph(page, trail, { sources: [{ label: "Unsafe", href }] }));
  }
});

 test("task-oriented support graph omits a review date that is not visible", () => {
  const page = publicPages.find(page => page.slug === "customer-support")!;
  const graph = editorialDiscoveryGraph({ path: "/customer-support", title: page.title, description: page.description },
    [{ label: "Home", href: "/" }, { label: "Customer support", href: "/customer-support" }]);
  assert.equal(graph[0].dateModified, undefined);
  assert.ok(!serializeJsonLd(graph).includes("dateModified"));
  assert.ok(!serializeJsonLd(graph).includes("streetAddress"), "Do not mark up an address absent from this page's contact card");
});

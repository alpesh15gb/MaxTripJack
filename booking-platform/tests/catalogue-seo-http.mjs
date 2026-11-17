/** Public-behaviour checks for the isolated catalogue SSR server only.
 * Start it with tests/catalogue-ssr-db.mts, then run:
 *   node --test tests/catalogue-seo-http.mjs
 * The destination is fixed to loopback; redirects and linked assets are never fetched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const BASE = new URL('http://127.0.0.1:3112');
const PUBLIC_ORIGIN = 'https://maxtravel.in';
const HOTEL_PATH = '/hotels/catalogue-test-hotel-01-hyderabad-900000001';
const FLIGHT_PATH = '/flights/lucknow-lko-to-bengaluru-blr';
const AUTHORED_FLIGHT_PATH = '/flights/lucknow-to-hyderabad';

function request(path) {
  assert.ok(path.startsWith('/') && !path.startsWith('//') && !/[\\\r\n]/.test(path), 'Only local absolute paths are allowed');
  const target = new URL(path, BASE);
  assert.equal(target.origin, 'http://127.0.0.1:3112', 'HTTP verifier must never leave its isolated loopback server');
  return new Promise((resolve, reject) => {
    const req = http.get(target, {
      headers: { host: 'maxtravel.in', 'x-forwarded-proto': 'https', 'user-agent': 'Googlebot', accept: 'text/html,application/xml,text/plain' },
      timeout: 20_000,
    }, response => {
      let body = '', size = 0;
      response.setEncoding('utf8');
      response.on('data', chunk => {
        size += Buffer.byteLength(chunk);
        if (size > 4 * 1024 * 1024) { req.destroy(new Error('Unexpectedly large fixture response')); return; }
        body += chunk;
      });
      response.on('end', () => resolve({ path, status: response.statusCode, headers: response.headers, body }));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`Isolated HTTP request timed out: ${path}`)));
    req.on('error', reject);
  });
}

function decode(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (raw, name) => {
    if (!name.startsWith('#')) return entities[name.toLowerCase()] ?? raw;
    const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : raw;
  });
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}
function tags(body, name) {
  return [...body.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
}
function jsonLd(body) {
  return [...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => attributes(match[1]).type === 'application/ld+json')
    .flatMap(match => {
      const data = JSON.parse(match[2]);
      return Array.isArray(data) ? data : data['@graph'] ?? [data];
    });
}
function hasType(node, type) { return [node['@type']].flat().includes(type); }
function robots(page) {
  return [page.headers['x-robots-tag'] ?? '', ...tags(page.body, 'meta').filter(tag => ['robots', 'googlebot'].includes(tag.name)).map(tag => tag.content ?? '')].join(',').toLowerCase();
}
function assertHtml(page, path) {
  assert.equal(page.status, 200, `${page.path} should serve a useful page`);
  assert.match(page.headers['content-type'] ?? '', /text\/html/i);
  const canonical = tags(page.body, 'link').filter(tag => tag.rel === 'canonical').map(tag => tag.href);
  assert.deepEqual(canonical, [PUBLIC_ORIGIN + path], `${page.path} needs one clean public canonical`);
  assert.ok(tags(page.body, 'meta').some(tag => tag.name === 'description' && tag.content?.length > 30), 'SSR description should be present');
  assert.match(page.body, /<h1\b[^>]*>[\s\S]+?<\/h1>/i, 'Page content must be in server HTML');
}
function assertIndexable(page) {
  assert.doesNotMatch(robots(page), /\bnoindex\b/, `${page.path} unexpectedly blocks indexing`);
  assert.match(robots(page), /\bindex\b/, `${page.path} should explicitly allow indexing in this approved production fixture`);
}
function assertNoindex(page) { assert.match(robots(page), /\bnoindex\b/, `${page.path} must not be indexed`); }
function locations(xml) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1])); }
function assertXml(page, type) {
  assert.equal(page.status, 200, `${page.path} must resolve at its public sitemap URL`);
  assert.match(page.headers['content-type'] ?? '', /(?:application|text)\/xml/i);
  assert.match(page.body, new RegExp(`<${type}\\b`));
  assert.doesNotMatch(page.body, /<!DOCTYPE|<html\b/i);
  for (const location of locations(page.body)) {
    const url = new URL(location);
    assert.equal(url.origin, PUBLIC_ORIGIN);
    assert.equal(url.search, ''); assert.equal(url.hash, '');
  }
}
function assertRedirect(page, destination) {
  assert.equal(page.status, 308, `${page.path} should permanently redirect`);
  assert.equal(new URL(page.headers.location, PUBLIC_ORIGIN).href, PUBLIC_ORIGIN + destination);
}

test('hotel property renders indexable facts and honest structured data before JavaScript', async () => {
  const page = await request(HOTEL_PATH);
  assertHtml(page, HOTEL_PATH); assertIndexable(page);
  assert.match(page.body, /Catalogue Test Hotel 01/); assert.match(page.body, /Synthetic Test Road/);
  const nodes = jsonLd(page.body), hotel = nodes.find(node => hasType(node, 'Hotel'));
  assert.ok(hotel, 'Hotel entity must be server rendered');
  assert.equal(hotel.name, 'Catalogue Test Hotel 01');
  assert.equal(hotel.address.addressLocality, 'Hyderabad');
  assert.equal(hotel.url, PUBLIC_ORIGIN + HOTEL_PATH);
  assert.ok(hotel.amenityFeature.some(item => item.name === 'Wi-Fi'));
  for (const field of ['offers', 'price', 'priceRange', 'aggregateRating', 'review']) assert.equal(hotel[field], undefined, `No invented ${field}`);
  // Supplied hotel classification is distinct from a customer review score.
  if (hotel.starRating) assert.equal(hotel.starRating.ratingValue, 3);
  assert.ok(nodes.some(node => hasType(node, 'BreadcrumbList')));
  for (const link of tags(page.body, 'a')) assert.ok(!link.href?.includes('hotelIds=900000001'), 'A production catalogue ID must not enter the UAT booking provider');
});

test('hotel directory pagination exposes distinct crawlable pages and complete coverage', async () => {
  const first = await request('/hotels'), second = await request('/hotels/page/2');
  assertHtml(first, '/hotels'); assertIndexable(first);
  assertHtml(second, '/hotels/page/2'); assertIndexable(second);
  const entries = page => jsonLd(page.body).find(node => hasType(node, 'ItemList'))?.itemListElement;
  const firstItems = entries(first), secondItems = entries(second);
  assert.equal(firstItems?.length, 24); assert.equal(secondItems?.length, 2);
  const urls = [...firstItems, ...secondItems].map(item => item.url);
  assert.equal(new Set(urls).size, 26, 'Pagination must not duplicate or drop fixture properties');
  assert.deepEqual(secondItems.map(item => item.position), [25, 26]);
  assert.ok(tags(first.body, 'a').some(tag => tag.href === '/hotels/page/2'), 'Next page needs a real crawlable link');
  assert.ok(tags(second.body, 'a').some(tag => tag.href === '/hotels'), 'Previous page needs a real crawlable link');
  assertRedirect(await request('/hotels/page/1'), '/hotels');
  assert.equal((await request('/hotels/page/3')).status, 404);
});

test('hotel canonical redirects, unavailable properties and thin/query exclusions behave correctly', async () => {
  assertRedirect(await request('/hotels/old-property-name-900000001'), HOTEL_PATH);
  for (const path of ['/hotels/unknown-property-900000097', '/hotels/inactive-test-hotel-900000099']) {
    const page = await request(path); assert.equal(page.status, 404, `${path} must not be a soft 404`); assertNoindex(page);
  }
  const thinPath = '/hotels/incomplete-test-hotel-900000098', thin = await request(thinPath);
  assertHtml(thin, thinPath); assertNoindex(thin);
  const filtered = await request('/hotels?q=Catalogue');
  assertHtml(filtered, '/hotels'); assertNoindex(filtered);
  const propertyQuery = await request(HOTEL_PATH + '?utm_source=isolated-test');
  assertHtml(propertyQuery, HOTEL_PATH); assertNoindex(propertyQuery);
});

test('locality search keeps the real phrase together instead of mixing unrelated name and address words', async () => {
  for (const query of ['Mira Road', 'Seasons Example Hotel Mira Road', 'Seasons Example Mumbai', 'Seasons Example Hotel Mira Road India']) {
    const page = await request('/hotels?' + new URLSearchParams({q:query}));
    assertHtml(page, '/hotels'); assertNoindex(page);
    const entries=jsonLd(page.body).find(node=>hasType(node,'ItemList'))?.itemListElement;
    assert.deepEqual(entries?.map(item=>item.name),['Seasons Example Hotel']);
  }
  const unrelated=await request('/hotels?q=Mira%20Road%20Albania');
  assertHtml(unrelated,'/hotels'); assertNoindex(unrelated);
  const entries=jsonLd(unrelated.body).find(node=>hasType(node,'ItemList'))?.itemListElement??[];
  assert.equal(entries.length,0);
});

test('root-level hotel sitemap index and shard enumerate only publishable properties', async () => {
  const index = await request('/hotel-sitemap.xml'); assertXml(index, 'sitemapindex');
  assert.deepEqual(locations(index.body), [PUBLIC_ORIGIN + '/hotel-sitemap-0.xml']);
  const shard = await request('/hotel-sitemap-0.xml'); assertXml(shard, 'urlset');
  const urls = locations(shard.body);
  assert.equal(urls.length, 26); assert.equal(new Set(urls).size, 26); assert.ok(urls.includes(PUBLIC_ORIGIN + HOTEL_PATH));
  assert.ok(urls.every(url => !/90000009[89]/.test(url)), 'Thin and inactive properties must stay out of sitemaps');
  assert.equal([...shard.body.matchAll(/<lastmod>[^<]+<\/lastmod>/g)].length, 26);
  assert.equal((await request('/hotel-sitemap-1.xml')).status, 404);
});

test('authored and observed flight routes render airport facts with clean search handoffs', async () => {
  const authored = await request(AUTHORED_FLIGHT_PATH), dynamic = await request(FLIGHT_PATH);
  assertHtml(authored, AUTHORED_FLIGHT_PATH); assertIndexable(authored);
  assertHtml(dynamic, FLIGHT_PATH); assertIndexable(dynamic);
  assert.match(authored.body, /Lucknow/); assert.match(authored.body, /Hyderabad/);
  assert.match(dynamic.body, /Bengaluru/); assert.match(dynamic.body, /Asia\/Kolkata/);
  const nodes = jsonLd(dynamic.body), page = nodes.find(node => hasType(node, 'WebPage'));
  assert.ok(page); assert.deepEqual(page.about.map(airport => airport.iataCode), ['LKO', 'BLR']);
  for (const node of nodes) assert.ok(!hasType(node, 'Flight') && !hasType(node, 'Offer'), 'Route planning must not fabricate an itinerary or fare');
  const search = tags(dynamic.body, 'a').map(tag => tag.href).filter(Boolean).map(href => new URL(href, PUBLIC_ORIGIN)).find(url => url.pathname === '/book' && url.searchParams.get('from') === 'LKO' && url.searchParams.get('to') === 'BLR');
  assert.ok(search, 'Route CTA should prefill only the actual airport pair');
  assert.deepEqual([...search.searchParams.keys()].sort(), ['from', 'product', 'to']);
  assert.equal(search.searchParams.get('product'), 'FLIGHT');
  assertRedirect(await request('/flights/old-city-lko-to-old-city-blr'), FLIGHT_PATH);
  assertRedirect(await request('/flights/lucknow-lko-to-hyderabad-hyd'), AUTHORED_FLIGHT_PATH);
  assert.equal((await request('/flights/lucknow-lko-to-chennai-maa')).status, 404, 'A known airport pair without route evidence must not generate an invented page');
  const query = await request(FLIGHT_PATH + '?date=2026-12-01'); assertHtml(query, FLIGHT_PATH); assertNoindex(query);
});

test('flight directory and root-level flight sitemap link only real published routes', async () => {
  const directory = await request('/flights/routes'); assertHtml(directory, '/flights/routes'); assertIndexable(directory);
  const links = tags(directory.body, 'a').map(tag => tag.href);
  assert.ok(links.includes(FLIGHT_PATH)); assert.ok(links.includes(AUTHORED_FLIGHT_PATH));
  const filtered = await request('/flights/routes?q=LKO'); assertHtml(filtered, '/flights/routes'); assertNoindex(filtered);
  const index = await request('/flight-routes-sitemap.xml'); assertXml(index, 'sitemapindex');
  assert.deepEqual(locations(index.body), [PUBLIC_ORIGIN + '/flight-route-sitemap-0.xml']);
  const shard = await request('/flight-route-sitemap-0.xml'); assertXml(shard, 'urlset');
  assert.deepEqual(locations(shard.body), [PUBLIC_ORIGIN + FLIGHT_PATH]);
  assert.equal((await request('/flight-route-sitemap-1.xml')).status, 404);
});

test('crawler entry points advertise root-scoped catalogues and the authored route', async () => {
  const robotsPage = await request('/robots.txt'); assert.equal(robotsPage.status, 200);
  for (const path of ['/sitemap.xml', '/hotel-sitemap.xml', '/flight-routes-sitemap.xml']) assert.ok(robotsPage.body.includes(`Sitemap: ${PUBLIC_ORIGIN}${path}`), `robots.txt should advertise ${path}`);
  const main = await request('/sitemap.xml'); assertXml(main, 'urlset');
  assert.ok(locations(main.body).includes(PUBLIC_ORIGIN + AUTHORED_FLIGHT_PATH));
});

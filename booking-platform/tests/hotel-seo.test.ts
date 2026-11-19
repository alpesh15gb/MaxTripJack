import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import type { HotelCatalogueRecord } from '../src/lib/hotel-catalogue';
import { hotelDirectoryPath, hotelIdFromSlug, hotelPropertyPath, isHotelPublicPath } from '../src/lib/hotel-public-path';
import { hotelContactHref, hotelDirectoryMetadata, hotelDirectoryStructuredData, hotelPageDescription, hotelPageMetadata, hotelPageTitle, hotelSitemapIndexXml, hotelSitemapXml, hotelStructuredData, hotelTestAvailabilityHref } from '../src/lib/hotel-seo';
import { requestMayBeIndexed, serializeJsonLd, SITE_ORIGIN } from '../src/lib/seo';
import { bookingSearchPrefill } from '../src/lib/booking-search-state';

const now = Date.parse('2026-11-17T06:00:00Z');
const approved = { NODE_ENV: 'production', SEO_INDEXING_ENABLED: 'true', SEO_SITE_ORIGIN: SITE_ORIGIN };
export const hotelFixture: HotelCatalogueRecord = {
  hotelId: '123456789', slug: 'synthetic-seasons-hotel-mira-road-123456789', name: 'Synthetic Seasons Hotel',
  city: 'Mira Road', countryName: 'India', countryCode: 'IN', address: 'Synthetic test address, Mira Road, India',
  description: 'Synthetic fixture only. This supplied description has enough property detail for deterministic testing without asserting any facts about a real hotel.',
  descriptionHeadline: 'A synthetic hotel fixture', starRating: 3, propertyType: 'Hotel',
  amenities: ['Wi-Fi', 'Parking', 'Reception', 'Restaurant'],
  photos: [{ url: 'https://i.travelapi.com/lodging/10000/test-property.jpg', caption: 'Room', isHero: true }],
  active: true, contentReady: true, environment: 'production', contentUpdatedAt: '2026-11-16T06:00:00.000Z', checkedAt: '2026-11-17T05:00:00.000Z',
};

test('hotel routes use a stable exact supplier identity and reject private or arbitrary paths', () => {
  assert.equal(hotelIdFromSlug(hotelFixture.slug), hotelFixture.hotelId);
  assert.equal(hotelIdFromSlug('ANOTHER-NAME-123456789'), hotelFixture.hotelId, 'Allows canonical redirect without accepting another identity');
  assert.equal(hotelPropertyPath(hotelFixture.slug), `/hotels/${hotelFixture.slug}`);
  for (const slug of ['123', 'hotel-0', '../hotel-123', 'hotel-123?token=x', 'hotel-123/rooms', 'hotel-01']) assert.equal(hotelIdFromSlug(slug), undefined, slug);
  for (const path of ['/hotels', '/hotels/page/2', `/hotels/${hotelFixture.slug}`]) assert.equal(isHotelPublicPath(path), true);
  for (const path of ['/book?product=HOTEL', '/hotels?q=secret', '/hotels/page/0', '/hotels/page/0002', '/hotels/page/-1', '/hotels/page/2/rooms', '/hotels/sitemap.xml', '/api/travel/hotel-content', '/hotels/unknown']) assert.equal(isHotelPublicPath(path), false, path);
  assert.equal(hotelDirectoryPath(1), '/hotels');
  assert.equal(hotelDirectoryPath(2), '/hotels/page/2');
  assert.throws(() => hotelDirectoryPath(0));
});

test('hotel indexability requires global approval, production data, active complete content and freshness', () => {
  assert.deepEqual(hotelPageMetadata(hotelFixture, approved, now).robots, { index: true, follow: true });
  for (const patch of [{ environment: 'uat' as const }, { active: false }, { contentReady: false }, { checkedAt: '2026-01-01T00:00:00Z' }]) {
    assert.equal((hotelPageMetadata({ ...hotelFixture, ...patch }, approved, now).robots as { index: boolean }).index, false);
  }
  assert.deepEqual(hotelPageMetadata(hotelFixture, {}, now).robots, { index: false, follow: false });
  assert.equal((hotelDirectoryMetadata(1, [hotelFixture], '', approved, now).robots as { index: boolean }).index, true);
  assert.equal((hotelDirectoryMetadata(1, [hotelFixture], 'Mira Road', approved, now).robots as { index: boolean }).index, false);
  assert.equal((hotelDirectoryMetadata(1, [], '', approved, now).robots as { index: boolean }).index, false);
  assert.equal((hotelDirectoryMetadata(2, [{ ...hotelFixture, environment: 'uat' }], '', approved, now).robots as { index: boolean }).index, false);
});

test('clean candidate routes can pass proxy while date/query/preview/private routes stay noindex', () => {
  assert.equal(requestMayBeIndexed(new URL(`${SITE_ORIGIN}/hotels/${hotelFixture.slug}`), approved), true);
  assert.equal(requestMayBeIndexed(new URL(`${SITE_ORIGIN}/hotels/page/2`), approved), true);
  for (const url of [`${SITE_ORIGIN}/hotels?q=Seasons`, `${SITE_ORIGIN}/hotels/${hotelFixture.slug}?date=2026-12-01`, `https://preview.example/hotels/${hotelFixture.slug}`, `${SITE_ORIGIN}/book?product=HOTEL&hotelIds=123`, `${SITE_ORIGIN}/operations`]) assert.equal(requestMayBeIndexed(new URL(url), approved), false);
  const before = { ...process.env };
  try {
    Object.assign(process.env, approved);
    const page = proxy(new NextRequest(`${SITE_ORIGIN}/hotels/${hotelFixture.slug}`));
    assert.equal(page.headers.get('X-Robots-Tag'), null);
    assert.match(page.headers.get('Content-Security-Policy') ?? '', /nonce-/);
    for (const path of ['/hotel-sitemap.xml', '/hotel-sitemap-0.xml', '/flight-routes-sitemap.xml', '/flight-route-sitemap-0.xml', '/hotels/sitemap/0.xml', '/flight-routes-sitemaps/0']) {
      const sitemap = proxy(new NextRequest(`${SITE_ORIGIN}${path}`));
      assert.equal(sitemap.headers.get('Content-Security-Policy'), null, path);
      assert.equal(sitemap.headers.get('Cache-Control'), null, path);
      assert.equal(sitemap.headers.get('X-Robots-Tag'), 'noindex, nofollow', path);
    }
  } finally {
    for (const key of Object.keys(approved)) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});

test('metadata and structured data use supplied facts without rates or invented guest reviews', () => {
  const metadata = hotelPageMetadata(hotelFixture, approved, now);
  assert.equal(metadata.alternates?.canonical, `${SITE_ORIGIN}/hotels/${hotelFixture.slug}`);
  assert.match(String(metadata.title), /Synthetic Seasons Hotel, Mira Road/);
  const nodes = hotelStructuredData(hotelFixture), property = nodes[0];
  assert.equal(property['@type'], 'Hotel');
  assert.equal((property as { starRating?: { ratingValue: number } }).starRating?.ratingValue, 3);
  const serialized = serializeJsonLd(nodes);
  assert.doesNotMatch(serialized, /aggregateRating|reviewCount|"offers"|"price"|"checkinTime"|"checkoutTime"/);
  assert.equal((nodes[1] as { description?: string }).description, metadata.description);
  assert.equal(JSON.parse(serializeJsonLd(hotelStructuredData({ ...hotelFixture, name: '</script><script>bad()</script>' })))[0].name, '</script><script>bad()</script>');
  assert.doesNotMatch(serializeJsonLd(hotelStructuredData({ ...hotelFixture, name: '</script>' })), /</);
  const list = hotelDirectoryStructuredData([hotelFixture], 2);
  assert.equal(list.itemListElement[0].position, 25);
  assert.equal(list.itemListElement[0].url, `${SITE_ORIGIN}/hotels/${hotelFixture.slug}`);
});

test('production catalogue IDs never enter the UAT booking provider', () => {
  assert.equal(hotelTestAvailabilityHref(hotelFixture), null);
  const uat = { ...hotelFixture, environment: 'uat' as const };
  const url = new URL(hotelTestAvailabilityHref(uat)!, SITE_ORIGIN);
  assert.equal(url.pathname, '/book');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['city', 'hotelIds', 'product']);
  const prefill = bookingSearchPrefill(Object.fromEntries(url.searchParams));
  assert.equal(prefill.searchInvalid, undefined);
  assert.equal(prefill.hotelIds, hotelFixture.hotelId);
  assert.equal(prefill.product, 'HOTEL');
  assert.equal(hotelTestAvailabilityHref({ ...uat, active: false }), null);
  const contact = new URL(hotelContactHref(hotelFixture, 'mailto:cs@maxtravel.in'));
  assert.equal(contact.protocol, 'mailto:');
  assert.match(contact.searchParams.get('subject') ?? '', /Synthetic Seasons Hotel, Mira Road/);
  assert.equal(hotelContactHref(hotelFixture, 'https://evil.example'), '/contact');
});

test('sitemap index is bounded and shards exclude UAT, inactive, thin and stale rows', () => {
  assert.equal((hotelSitemapIndexXml(20_001).match(/<sitemap>/g) ?? []).length, 3);
  assert.match(hotelSitemapIndexXml(20_001), /\/hotel-sitemap-2\.xml/);
  assert.doesNotMatch(hotelSitemapIndexXml(0), /<sitemap>/);
  assert.throws(() => hotelSitemapIndexXml(-1));
  assert.throws(() => hotelSitemapIndexXml(500_000_001));
  const xml = hotelSitemapXml([hotelFixture, { ...hotelFixture, environment: 'uat' }, { ...hotelFixture, active: false }, { ...hotelFixture, contentReady: false }, { ...hotelFixture, checkedAt: '2025-01-01T00:00:00Z' }], now);
  assert.equal((xml.match(/<url>/g) ?? []).length, 1);
  assert.match(xml, new RegExp(hotelFixture.contentUpdatedAt.replaceAll('.', '\\.')));
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) assert.doesNotMatch(match[1], /\?|token|\/book/);
  assert.throws(() => hotelSitemapXml(Array.from({ length: 10_001 }, () => hotelFixture), now));
});

test('hotel titles and descriptions fit search snippets without cutting words', () => {
  const long = { ...hotelFixture, name: '"27" Spathodea- Oasis in the City, a Boutique Garden Residence', city: 'COLOMBO 05' };
  for (const hotel of [hotelFixture, long]) {
    assert.ok(hotelPageTitle(hotel).length <= 50, hotelPageTitle(hotel));
    assert.ok(hotelPageDescription(hotel).length <= 158, hotelPageDescription(hotel));
  }
  assert.match(hotelPageTitle(long), /\S…$/);
  assert.ok(hotelPageTitle(hotelFixture).startsWith(hotelFixture.name));
});

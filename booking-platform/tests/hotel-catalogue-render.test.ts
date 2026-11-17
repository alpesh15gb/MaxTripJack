import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import type { HotelCatalogueRecord } from '../src/lib/hotel-catalogue';
import HotelGallery from '../src/components/hotel-gallery';

const require = createRequire(import.meta.url);
type PropertyProps = { hotel: HotelCatalogueRecord; emailHref: string };
type DirectoryProps = { hotels: HotelCatalogueRecord[]; total: number; page: number; query: string };
const component = build({ entryPoints: ['src/components/hotel-catalogue-pages.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, loader: { '.css': 'empty' }, jsx: 'automatic' }).then(result => {
  const compiled = { exports: {} as { HotelPropertyContent: ComponentType<PropertyProps>; HotelDirectoryContent: ComponentType<DirectoryProps>; HotelCatalogueUnavailable: ComponentType<{ property?: boolean }> } };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
  return compiled.exports;
});
const hotel: HotelCatalogueRecord = { hotelId: '2468', slug: 'synthetic-hotel-test-city-2468', name: 'Synthetic Hotel', city: 'Test City', countryName: 'India', countryCode: 'IN', address: 'A supplied test address', description: 'A supplied property description rendered in initial HTML.', descriptionHeadline: 'A supplied headline', amenities: ['Parking', 'Wi-Fi', 'Reception', 'Restaurant'], photos: [{ url: 'https://i.travelapi.com/lodging/10000/test.jpg', isHero: true }], active: true, contentReady: true, environment: 'production', checkedAt: '2026-11-17T05:00:00Z', contentUpdatedAt: '2026-11-16T05:00:00Z', starRating: 3 };

test('property SSR contains actual name, address, description, amenities, photos and honest availability CTA', async () => {
  const html = renderToStaticMarkup(createElement((await component).HotelPropertyContent, { hotel, emailHref: 'mailto:cs@maxtravel.in' }));
  assert.match(html, /<h1>Synthetic Hotel<\/h1>/);
  for (const value of [hotel.address, hotel.description!, hotel.descriptionHeadline!, ...hotel.amenities]) assert.ok(html.includes(value), value);
  assert.match(html, /3-star property category/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.match(html, /Enquire about this hotel/);
  assert.match(html, /mailto:cs@maxtravel.in\?subject=Hotel/);
  assert.doesNotMatch(html, /hotelIds=2468|₹|aggregateRating|guest rating|lowest price|free cancellation|Book now/i);
  assert.match(html, /id="hotel-questions"/);
  assert.match(html, /id="hotel-availability-title"/);
  assert.match(html, /datetime="2026-11-17T05:00:00Z"/i);
});

test('UAT page preserves exact selected supplier ID but clearly labels test-only flow', async () => {
  const html = renderToStaticMarkup(createElement((await component).HotelPropertyContent, { hotel: { ...hotel, environment: 'uat' }, emailHref: 'mailto:cs@maxtravel.in' }));
  assert.match(html, /Check test availability/);
  assert.match(html, /hotelIds=2468/);
  assert.match(html, /Testing only/);
  assert.match(html, /does not reserve a room or make a live booking/);
  assert.doesNotMatch(html, /autoSearch|browseSearch|selectionKey|nationality=/);
});

test('directory SSR renders property links, search and clean crawlable bounded pagination', async () => {
  const html = renderToStaticMarkup(createElement((await component).HotelDirectoryContent, { hotels: [hotel], total: 250_000, page: 3, query: '' }));
  assert.match(html, /href="\/hotels\/synthetic-hotel-test-city-2468"/);
  assert.match(html, /action="\/hotels" method="get"/);
  assert.match(html, /href="\/hotels\/page\/2"/);
  assert.match(html, /href="\/hotels\/page\/4"/);
  assert.match(html, /aria-current="page"/);
  assert.ok((html.match(/aria-label="Hotel directory page /g) ?? []).length <= 5);
  const filtered = renderToStaticMarkup(createElement((await component).HotelDirectoryContent, { hotels: [hotel], total: 50, page: 2, query: 'Test City' }));
  assert.match(filtered, /\/hotels\?q=Test\+City/);
  assert.match(filtered, /Clear search/);
});

test('missing metadata and no results remain honest and malicious supplier text is escaped', async () => {
  const exports = await component;
  const missing = renderToStaticMarkup(createElement(exports.HotelPropertyContent, { hotel: { ...hotel, description: undefined, descriptionHeadline: undefined, amenities: [], photos: [] }, emailHref: 'mailto:cs@maxtravel.in' }));
  assert.match(missing, /supplier has not provided a detailed property description/);
  assert.match(missing, /Amenities have not been supplied/);
  assert.match(missing, /See the supplied address and any listed amenities below, or contact our team/);
  assert.doesNotMatch(missing, /explore the available room options/);
  assert.doesNotMatch(missing, /undefined|NaN|₹0/);
  const escaped = renderToStaticMarkup(createElement(exports.HotelPropertyContent, { hotel: { ...hotel, name: '<script>unsafe()</script>', description: '<img src=x onerror=unsafe()>' }, emailHref: 'mailto:cs@maxtravel.in' }));
  assert.doesNotMatch(escaped, /<script>unsafe|<img src=x/);
  assert.match(escaped, /&lt;script&gt;/);
  const empty = renderToStaticMarkup(createElement(exports.HotelDirectoryContent, { hotels: [], total: 0, page: 1, query: 'Unmatched' }));
  assert.match(empty, /No matching hotels in the directory yet/);
  const unavailable = renderToStaticMarkup(createElement(exports.HotelCatalogueUnavailable, { property: true }));
  assert.match(unavailable, /Property details are temporarily unavailable/);
  assert.match(unavailable, /Contact our team/);
});

test('existing checkout photo fallback keeps its room-options guidance', () => {
  const html = renderToStaticMarkup(createElement(HotelGallery, { name: 'Synthetic Hotel', photos: [], open: false, onOpenChange: () => {} }));
  assert.match(html, /You can still explore the available room options/);
});

test('catalogue navigation does not change the existing checkout hotel-switch destination', async () => {
  const result = await build({ entryPoints: ['src/components/travel-shell.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, loader: { '.css': 'empty' }, jsx: 'automatic' });
  const compiled = { exports: {} as { TravelHeader: ComponentType<{ active: 'hotels'; hotelHref?: '/hotels' }> } };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
  const checkout = renderToStaticMarkup(createElement(compiled.exports.TravelHeader, { active: 'hotels' }));
  assert.match(checkout, /href="\/book\?product=HOTEL"/);
  const catalogue = renderToStaticMarkup(createElement(compiled.exports.TravelHeader, { active: 'hotels', hotelHref: '/hotels' }));
  assert.match(catalogue, /href="\/hotels"/);
});

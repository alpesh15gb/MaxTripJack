import test from 'node:test';
import assert from 'node:assert/strict';
import { getRewrittenUrl, unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';
import nextConfig from '../next.config';
import { hotelSitemapIndexXml } from '../src/lib/hotel-seo';
import { flightSitemapIndex } from '../src/lib/flight-route-sitemap';
import { SITE_ORIGIN } from '../src/lib/seo';

test('advertised sitemap shards have root scope and resolve to existing handlers without redirects', async () => {
  const aliases = [
    ['/hotel-sitemap.xml', '/hotels/sitemap.xml'],
    ['/hotel-sitemap-0.xml', '/hotels/sitemap/0.xml'],
    ['/hotel-sitemap-234.xml', '/hotels/sitemap/234.xml'],
    ['/flight-route-sitemap-0.xml', '/flight-routes-sitemaps/0'],
    ['/flight-route-sitemap-234.xml', '/flight-routes-sitemaps/234'],
  ];
  for (const [path, destination] of aliases) {
    const response = await unstable_getResponseFromNextConfig({ url: `${SITE_ORIGIN}${path}`, nextConfig });
    assert.equal(getRewrittenUrl(response), `${SITE_ORIGIN}${destination}`, path);
    assert.equal(response.headers.get('location'), null, path);
  }
  for (const xml of [hotelSitemapIndexXml(20_001), flightSitemapIndex(3)]) {
    for (const [, location] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = new URL(location);
      assert.equal(new URL('.', url).pathname, '/', location);
      const response = await unstable_getResponseFromNextConfig({ url: location, nextConfig });
      assert.ok(getRewrittenUrl(response), location);
    }
  }
});

test('sitemap aliases accept numeric shard identifiers only', async () => {
  for (const path of ['/hotel-sitemap-secret.xml', '/hotel-sitemap-1xml', '/hotel-sitemap-1.json', '/flight-route-sitemap--1.xml', '/flight-route-sitemap-1/2.xml']) {
    const response = await unstable_getResponseFromNextConfig({ url: `${SITE_ORIGIN}${path}`, nextConfig });
    assert.equal(getRewrittenUrl(response), null, path);
  }
});

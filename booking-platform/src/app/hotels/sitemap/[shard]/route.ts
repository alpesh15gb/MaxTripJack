import { getCatalogueStats, listCatalogueSitemapHotels } from '@/lib/hotel-catalogue-store';
import { hotelSitemapXml, HOTEL_SITEMAP_PAGE_SIZE } from '@/lib/hotel-seo';
import { indexingEnabled } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ shard: string }> }) {
  const { shard } = await params;
  if (!/^(0|[1-9]\d{0,4})\.xml$/.test(shard)) return new Response('Not found.', { status: 404 });
  if (!indexingEnabled()) return new Response(hotelSitemapXml([]), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  const stats = await getCatalogueStats();
  if (!stats.available) return new Response('Hotel sitemap temporarily unavailable.', { status: 503, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' } });
  const page = Number(shard.slice(0, -4));
  if (page >= Math.ceil(stats.productionIndexableTotal / HOTEL_SITEMAP_PAGE_SIZE)) return new Response('Not found.', { status: 404 });
  try {
    const hotels = await listCatalogueSitemapHotels(page, HOTEL_SITEMAP_PAGE_SIZE);
    return new Response(hotelSitemapXml(hotels), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return new Response('Hotel sitemap temporarily unavailable.', { status: 503, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' } });
  }
}

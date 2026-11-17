import { getCatalogueStats } from '@/lib/hotel-catalogue-store';
import { hotelSitemapIndexXml } from '@/lib/hotel-seo';
import { indexingEnabled } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export async function GET() {
  if (!indexingEnabled()) return new Response(hotelSitemapIndexXml(0), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  const stats = await getCatalogueStats();
  if (!stats.available) return new Response('Hotel sitemap temporarily unavailable.', { status: 503, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' } });
  return new Response(hotelSitemapIndexXml(stats.productionIndexableTotal), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

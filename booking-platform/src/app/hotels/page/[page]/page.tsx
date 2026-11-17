import { notFound, permanentRedirect } from 'next/navigation';
import { TravelFooter, TravelHeader } from '@/components/travel-shell';
import { HotelCatalogueUnavailable, HotelDirectoryContent } from '@/components/hotel-catalogue-pages';
import SeoJsonLd from '@/components/seo-json-ld';
import { hotelDirectoryMetadata, hotelDirectoryStructuredData, HOTEL_DIRECTORY_PAGE_SIZE } from '@/lib/hotel-seo';
import { hotelDirectoryQuery, readHotelDirectory } from '@/lib/hotel-public-server';

type Props = { params: Promise<{ page: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = 'force-dynamic';

async function directoryRequest(props: Props) {
  const [{ page: rawPage }, search] = await Promise.all([props.params, props.searchParams]);
  if (!/^[1-9]\d{0,6}$/.test(rawPage)) notFound();
  const page = Number(rawPage), query = hotelDirectoryQuery(search.q);
  if (page === 1) permanentRedirect('/hotels' + (query ? `?${new URLSearchParams({ q: query })}` : ''));
  const result = await readHotelDirectory(page, query);
  if (result.available && page > Math.ceil(result.total / HOTEL_DIRECTORY_PAGE_SIZE)) notFound();
  return { page, query, result };
}

export async function generateMetadata(props: Props) {
  const { page, query, result } = await directoryRequest(props);
  return hotelDirectoryMetadata(page, result.available ? result.hotels : [], query);
}

export default async function HotelDirectoryPage(props: Props) {
  const { page, query, result } = await directoryRequest(props);
  return <div className="catalogue-site"><TravelHeader active="hotels" hotelHref="/hotels" />{result.available ? <><HotelDirectoryContent hotels={result.hotels} total={result.total} page={page} query={query} /><SeoJsonLd id="hotel-directory-schema" data={hotelDirectoryStructuredData(result.hotels, page)} /></> : <HotelCatalogueUnavailable />}<TravelFooter /></div>;
}

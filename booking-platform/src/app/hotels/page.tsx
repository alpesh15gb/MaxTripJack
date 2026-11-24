import { TravelFooter, TravelHeader } from '@/components/travel-shell';
import { HotelCatalogueUnavailable, HotelDirectoryContent } from '@/components/hotel-catalogue-pages';
import SeoJsonLd from '@/components/seo-json-ld';
import { hotelDirectoryMetadata, hotelDirectoryStructuredData } from '@/lib/hotel-seo';
import { hotelDirectoryQuery, readHotelDirectory } from '@/lib/hotel-public-server';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: Props) {
  const query = hotelDirectoryQuery((await searchParams).q);
  const result = await readHotelDirectory(1, query);
  return hotelDirectoryMetadata(1, result.available ? result.hotels : [], query);
}

export default async function HotelsPage({ searchParams }: Props) {
  const query = hotelDirectoryQuery((await searchParams).q);
  const result = await readHotelDirectory(1, query);
  return <div className="catalogue-site"><TravelHeader active="hotels" hotelHref="/hotels" />{result.available ? <><HotelDirectoryContent hotels={result.hotels} total={result.total} page={1} query={query} />{result.hotels.length > 0 && <SeoJsonLd id="hotel-directory-schema" data={hotelDirectoryStructuredData(result.hotels, 1)} />}</> : <HotelCatalogueUnavailable query={query}/>}<TravelFooter /></div>;
}

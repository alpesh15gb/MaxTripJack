import { notFound, permanentRedirect } from 'next/navigation';
import { HotelCatalogueUnavailable, HotelPropertyContent } from '@/components/hotel-catalogue-pages';
import { TravelFooter, TravelHeader } from '@/components/travel-shell';
import SeoJsonLd from '@/components/seo-json-ld';
import { getCompanyProfile } from '@/lib/company-settings';
import { hotelIdFromSlug, hotelPropertyPath } from '@/lib/hotel-public-path';
import { readPublicHotel } from '@/lib/hotel-public-server';
import { hotelPageMetadata, hotelStructuredData } from '@/lib/hotel-seo';
import { privatePageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ slug: string }> };
export const dynamic = 'force-dynamic';

async function propertyRequest({ params }: Props) {
  const { slug } = await params, id = hotelIdFromSlug(slug);
  if (!id) notFound();
  const result = await readPublicHotel(id);
  if (!result.available) return result;
  if (!result.hotel || !result.hotel.active) notFound();
  if (slug !== result.hotel.slug) permanentRedirect(hotelPropertyPath(result.hotel.slug));
  return result;
}

export async function generateMetadata(props: Props) {
  const result = await propertyRequest(props);
  return result.hotel ? hotelPageMetadata(result.hotel) : privatePageMetadata('Hotel details temporarily unavailable');
}

export default async function HotelPropertyPage(props: Props) {
  const result = await propertyRequest(props);
  const company = result.hotel ? await getCompanyProfile() : undefined;
  return <div className="catalogue-site"><TravelHeader active="hotels" hotelHref="/hotels" />{result.hotel ? <><HotelPropertyContent hotel={result.hotel} emailHref={company!.emailHref} /><SeoJsonLd id="hotel-property-schema" data={hotelStructuredData(result.hotel)} /></> : <HotelCatalogueUnavailable property />}<TravelFooter /></div>;
}

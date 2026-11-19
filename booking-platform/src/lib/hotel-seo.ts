import type { Metadata } from 'next';
import type { HotelCatalogueRecord } from './hotel-catalogue';
import { isCatalogueHotelIndexable } from './hotel-catalogue';
import { bookingSearchUrl } from './booking-search-state';
import { hotelDirectoryPath, hotelPropertyPath } from './hotel-public-path';
import { safeHotelPhotoUrl } from './hotel-presentation';
import { canonicalUrl, indexingEnabled, pageMetadata, SITE_NAME, type SeoEnvironment } from './seo';

export const HOTEL_DIRECTORY_PAGE_SIZE = 24;
export const HOTEL_SITEMAP_PAGE_SIZE = 10_000;
export const HOTEL_SITEMAP_INDEX_PATH = '/hotel-sitemap.xml';

/** Trim at a word boundary so snippets never end mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:–-]+$/, '')}…`;
}

function hotelLocation(hotel: HotelCatalogueRecord, separator: string): string {
  return hotel.city && !hotel.name.toLowerCase().includes(hotel.city.toLowerCase()) ? `${separator}${hotel.city}` : '';
}

/** Search snippets show about 155 characters; keep the useful part inside that. */
export function hotelPageDescription(hotel: HotelCatalogueRecord): string {
  return clip(`${hotel.name}${hotelLocation(hotel, ' in ')}: see photos, address and amenities, then check room availability for your dates.`, 158);
}

/** The layout appends " | MaxTravel"; keep the whole title near 60 characters. */
export function hotelPageTitle(hotel: HotelCatalogueRecord): string {
  const base = `${hotel.name}${hotelLocation(hotel, ', ')}`;
  return base.length <= 30 ? `${base} – Photos & Amenities` : clip(base, 50);
}

export function hotelPageMetadata(hotel: HotelCatalogueRecord, environment: SeoEnvironment = process.env, now = Date.now()): Metadata {
  const path = hotelPropertyPath(hotel.slug), title = hotelPageTitle(hotel), description = hotelPageDescription(hotel);
  const images = hotel.photos.filter(photo => safeHotelPhotoUrl(photo.url)).slice(0, 1).map(photo => ({ url: photo.url, alt: `${hotel.name}${photo.caption ? ` · ${photo.caption}` : ''}` }));
  const base = pageMetadata(path, title, description);
  return {
    ...base,
    robots: { index: indexingEnabled(environment) && isCatalogueHotelIndexable(hotel, now), follow: indexingEnabled(environment) },
    openGraph: { ...base.openGraph, images: images.length ? images : undefined },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title, description, ...(images.length ? { images } : {}) },
  };
}

export function hotelDirectoryMetadata(page: number, hotels: HotelCatalogueRecord[], query = '', environment: SeoEnvironment = process.env, now = Date.now()): Metadata {
  const title = query ? `Hotel search: ${query}` : page > 1 ? `Browse hotels – Page ${page}` : 'Hotels: Photos, Amenities & Availability';
  const description = 'Explore hotel addresses, property photos and supplied amenities with MaxTravel. Find a stay and check availability for your dates.';
  return { ...pageMetadata(hotelDirectoryPath(page), title, description), robots: { index: !query && indexingEnabled(environment) && hotels.some(hotel => isCatalogueHotelIndexable(hotel, now)), follow: indexingEnabled(environment) } };
}

/** Booking providers currently use UAT. Never pass a production catalogue ID to them. */
export function hotelTestAvailabilityHref(hotel: HotelCatalogueRecord): string | null {
  if (hotel.environment !== 'uat' || !hotel.active) return null;
  return bookingSearchUrl({ product: 'HOTEL', hotelIds: hotel.hotelId, city: `${hotel.name}${hotel.city ? `, ${hotel.city}` : ''}`.slice(0, 150) });
}

/** A compose link only; this never sends an enquiry or claims a live room price. */
export function hotelContactHref(hotel: HotelCatalogueRecord, emailHref: string): string {
  if (!/^mailto:[^?\s<>\r\n]+@[^?\s<>\r\n]+$/.test(emailHref)) return '/contact';
  const subject = `Hotel enquiry: ${hotel.name}${hotel.city ? `, ${hotel.city}` : ''}`;
  return `${emailHref}?${new URLSearchParams({ subject }).toString()}`;
}

export function hotelStructuredData(hotel: HotelCatalogueRecord) {
  const url = canonicalUrl(hotelPropertyPath(hotel.slug));
  const photos = hotel.photos.filter(photo => safeHotelPhotoUrl(photo.url)).map(photo => photo.url);
  const property = {
    '@context': 'https://schema.org', '@type': !hotel.propertyType || /hotel|resort|lodge/i.test(hotel.propertyType) ? 'Hotel' : 'LodgingBusiness',
    '@id': `${url}#property`, url, name: hotel.name,
    ...(hotel.description ? { description: hotel.description } : {}),
    address: { '@type': 'PostalAddress', streetAddress: hotel.address, addressLocality: hotel.city, ...(hotel.countryCode ? { addressCountry: hotel.countryCode } : {}) },
    ...(photos.length ? { image: photos } : {}),
    ...(hotel.starRating ? { starRating: { '@type': 'Rating', ratingValue: hotel.starRating, bestRating: 5, worstRating: 1 } } : {}),
    ...(hotel.amenities.length ? { amenityFeature: hotel.amenities.map(name => ({ '@type': 'LocationFeatureSpecification', name, value: true })) } : {}),
    ...(typeof hotel.latitude === 'number' && typeof hotel.longitude === 'number' && Math.abs(hotel.latitude) <= 90 && Math.abs(hotel.longitude) <= 180 ? { geo: { '@type': 'GeoCoordinates', latitude: hotel.latitude, longitude: hotel.longitude } } : {}),
  };
  return [property, {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url,
    name: hotelPageTitle(hotel), description: hotelPageDescription(hotel), inLanguage: 'en-IN',
    dateModified: hotel.contentUpdatedAt, mainEntity: { '@id': `${url}#property` },
    isPartOf: { '@id': `${canonicalUrl('/')}#website` }, publisher: { '@id': `${canonicalUrl('/')}#organization` },
    breadcrumb: { '@id': `${url}#breadcrumb` },
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [{ name: 'Home', item: canonicalUrl('/') }, { name: 'Hotels', item: canonicalUrl('/hotels') }, { name: hotel.name, item: url }].map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })),
  }, {
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${canonicalUrl('/')}#website`, name: SITE_NAME, url: canonicalUrl('/'),
    publisher: { '@id': `${canonicalUrl('/')}#organization` },
  }, { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${canonicalUrl('/')}#organization`, name: SITE_NAME, url: canonicalUrl('/') }];
}

export function hotelDirectoryStructuredData(hotels: HotelCatalogueRecord[], page: number) {
  const url = canonicalUrl(hotelDirectoryPath(page));
  return { '@context': 'https://schema.org', '@type': 'ItemList', '@id': `${url}#hotels`, itemListElement: hotels.map((hotel, index) => ({ '@type': 'ListItem', position: (page - 1) * HOTEL_DIRECTORY_PAGE_SIZE + index + 1, name: hotel.name, url: canonicalUrl(hotelPropertyPath(hotel.slug)) })) };
}

export function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function hotelSitemapIndexXml(total: number): string {
  if (!Number.isSafeInteger(total) || total < 0 || total > HOTEL_SITEMAP_PAGE_SIZE * 50_000) throw new Error('Invalid sitemap total.');
  const entries = Array.from({ length: Math.ceil(total / HOTEL_SITEMAP_PAGE_SIZE) }, (_, shard) => `<sitemap><loc>${canonicalUrl(`/hotel-sitemap-${shard}.xml`)}</loc></sitemap>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
}

export function hotelSitemapXml(hotels: HotelCatalogueRecord[], now = Date.now()): string {
  if (hotels.length > HOTEL_SITEMAP_PAGE_SIZE) throw new Error('Hotel sitemap shard exceeds its limit.');
  const entries = hotels.filter(hotel => isCatalogueHotelIndexable(hotel, now)).map(hotel => `<url><loc>${xmlEscape(canonicalUrl(hotelPropertyPath(hotel.slug)))}</loc><lastmod>${xmlEscape(hotel.contentUpdatedAt)}</lastmod></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

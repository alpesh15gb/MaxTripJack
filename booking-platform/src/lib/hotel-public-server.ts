import 'server-only';
import { cache } from 'react';
import { getCatalogueHotel, listCatalogueHotels } from './hotel-catalogue-store';
import { HOTEL_DIRECTORY_PAGE_SIZE } from './hotel-seo';

// Shared by metadata and HTML during one request; never contacts Tripjack.
export const readPublicHotel = cache(async (hotelId: string) => {
  try { return { available: true as const, hotel: await getCatalogueHotel(hotelId) }; }
  catch { return { available: false as const, hotel: undefined }; }
});

export const readHotelDirectory = cache((page: number, query: string) => listCatalogueHotels({ page, pageSize: HOTEL_DIRECTORY_PAGE_SIZE, ...(query ? { query } : {}) }));

export function hotelDirectoryQuery(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

import {hotelObject, hotelPropertyDetails, safeHotelPhotoUrl} from './hotel-presentation';

export type HotelCatalogueEnvironment = 'uat' | 'production';
export const HOTEL_CATALOGUE_FRESH_DAYS = 90;
export const HOTEL_CATALOGUE_SITEMAP_SIZE = 10_000;
export type HotelCatalogueRecord = {
  hotelId: string;
  slug: string;
  name: string;
  city: string;
  countryName: string;
  countryCode?: string;
  address: string;
  description?: string;
  descriptionHeadline?: string;
  starRating?: number;
  propertyType?: string;
  amenities: string[];
  photos: {url: string; caption?: string; isHero: boolean}[];
  latitude?: number;
  longitude?: number;
  active: boolean;
  contentReady: boolean;
  environment: HotelCatalogueEnvironment;
  contentUpdatedAt: string;
  checkedAt: string;
};
export type HotelCatalogueContent = Omit<HotelCatalogueRecord, 'contentUpdatedAt' | 'checkedAt'>;

export function catalogueHotelId(value: unknown): string | undefined {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof id === 'string' && /^[1-9]\d{0,29}$/.test(id) ? id : undefined;
}

/** Plain text projection only. Render as React text, never as HTML. */
export function catalogueText(value: unknown, maximum = 500): string {
  if (typeof value !== 'string' || value.length > 32_000) return '';
  const entities: Record<string,string> = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”'};
  const decoded = value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return entities[name.toLowerCase()] ?? entity;
    const point = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2),16) : parseInt(name.slice(1),10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  });
  const clean = decoded.replace(/<!--[\s\S]*?(?:-->|$)/g,' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ')
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g,' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim();
  return /[<>]/.test(clean) ? '' : clean.slice(0, maximum);
}

export function catalogueHotelSlug(name: string, city: string, hotelId: string): string {
  if (!catalogueHotelId(hotelId)) throw new Error('Invalid catalogue hotel ID.');
  const base = `${name} ${city}`.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110).replace(/-$/,'');
  return `${base || 'hotel'}-${hotelId}`;
}

export function catalogueAddress(value: unknown, city?: string, country?: string): string {
  const parts=catalogueText(value,1000).split(',').map(part=>part.trim()).filter(Boolean);
  const uniquePlaces=[...new Set([
    catalogueText(city,120),catalogueText(country,120),
    ...parts.filter(part=>/^[\p{L}\p{M}]+$/u.test(part)),
  ].filter(Boolean))].sort((a,b)=>b.length-a.length);
  const placePattern=uniquePlaces.map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const token=new RegExp(`(?:${[...placePattern,'[1-9][0-9]{5}'].join('|')})(?=\\s|$)`,'iu');
  const segments=parts.flatMap(part=>{
    const names:string[]=[];
    let rest=part;
    while(rest){
      const match=token.exec(rest);
      if(!match||match.index!==0)return [part];
      names.push(match[0]);
      rest=rest.slice(match[0].length).trimStart();
    }
    return names;
  });
  const seen = new Set<string>();
  return segments.filter(part=>{
    const key=part.toLowerCase();
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
  }).join(', ');
}

export function catalogueAmenities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const amenities = value.map(item => catalogueText(item,200)).map(item =>
    /^smoke[- ](?:free|complimentary) property$/i.test(item) ? 'Smoke-free property' : item
  ).filter(Boolean);
  return [...new Set(amenities)].slice(0,40);
}

/** Catalogue facts have no date-specific price, availability, cancellation or review claims. */
export function normaliseCatalogueHotel(raw: unknown, countryName: string, environment: HotelCatalogueEnvironment): HotelCatalogueContent | undefined {
  const source = hotelObject(raw), hotelId = catalogueHotelId(source.tjHotelId);
  if (!hotelId) return undefined;
  const property = hotelPropertyDetails(source);
  const name = catalogueText(source.name,200), city = catalogueText(property.city,200);
  const country = catalogueText(countryName,120), address = catalogueAddress(property.address,city,country);
  const description = catalogueText(property.description,4000);
  const descriptionHeadline = catalogueText(property.descriptionHeadline,200);
  const amenities = catalogueAmenities(property.amenities);
  const photos = (property.photos ?? []).filter(photo => safeHotelPhotoUrl(photo.url)).map(photo => ({
    url:photo.url, isHero:photo.isHero, ...(catalogueText(photo.caption,200) ? {caption:catalogueText(photo.caption,200)} : {}),
  }));
  // A named/addressed property needs useful supplier detail, rather than a thin empty page.
  const contentReady = Boolean(name.length >= 2 && city && country && address.length >= 8 && (description.length >= 120 || amenities.length >= 4));
  return {
    hotelId, slug:catalogueHotelSlug(name,city,hotelId), name, city, countryName:country, address,
    ...(property.countryCode ? {countryCode:property.countryCode} : {}),
    ...(description ? {description} : {}), ...(descriptionHeadline ? {descriptionHeadline} : {}),
    ...(property.starRating ? {starRating:property.starRating} : {}),
    ...(catalogueText(property.propertyType,100) ? {propertyType:catalogueText(property.propertyType,100)} : {}),
    amenities, photos, active:source.is_active !== false, contentReady, environment,
  };
}

export function catalogueHotelFresh(record: Pick<HotelCatalogueRecord,'checkedAt'>, now = Date.now()) {
  const checked = Date.parse(record.checkedAt);
  return Number.isFinite(checked) && checked <= now + 5 * 60_000 && checked > now - HOTEL_CATALOGUE_FRESH_DAYS * 86_400_000;
}

export function isCatalogueHotelIndexable(record: HotelCatalogueRecord, now = Date.now()) {
  return record.environment === 'production' && record.active && record.contentReady && catalogueHotelFresh(record, now);
}

export function catalogueEnvironment(env: Readonly<Record<string,string | undefined>> = process.env): HotelCatalogueEnvironment {
  const value = env.HOTEL_CATALOGUE_ENVIRONMENT?.trim() || 'uat';
  if (value !== 'uat' && value !== 'production') throw new Error('Invalid hotel catalogue environment.');
  if (value === 'production' && env.HOTEL_CATALOGUE_PRODUCTION_APPROVED !== 'true') {
    throw new Error('Production hotel catalogue requires explicit supplier approval.');
  }
  return value;
}

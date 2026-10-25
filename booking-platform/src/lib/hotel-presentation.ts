import {supplierInstant} from './supplier-time';
/** Customer-safe hotel metadata from the TripJack v3 contract.
 * Source: https://tripjack.com/page/api-doc (Hotel API v3).
 * Static property content is never evidence of availability or a bookable rate.
 */
export type HotelCancellation = {
  isRefundable?: boolean;
  penalties: { from: string; to: string; amount: number }[];
  deadlineDateTime?: string;
};
export type HotelRoomOption = {
  optionId: string;
  optionType?: string;
  roomInfo: { id?: string; name: string }[];
  inclusions: string[];
  mealBasis?: string;
  bookingNotes?: string;
  cancellation: HotelCancellation;
  pricing: { totalPrice: number; currency: string; mf?: number; mft?: number };
};
export type HotelPropertyDetails = {
  starRating?: number;
  propertyType?: string;
  address?: string;
  descriptionHeadline?: string;
  description?: string;
  amenities: string[];
  photos?: {url: string; caption?: string; isHero: boolean}[];
};
export function hotelObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** React renders returned strings as text; never pass them to innerHTML. */
export function hotelText(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return text ? text.slice(0, max) : undefined;
}
export function hotelStringList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(item => hotelText(item)).filter((item): item is string => Boolean(item)))].slice(0, 40) : [];
}
/** Exact supplier image locations observed in static content. Shared by normalization
 * and browser rendering; never fetch/proxy supplier URLs on the server. */
export function safeHotelPhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  const prefix = ['https://pix8.agoda.net/hotelImages/', 'https://i.travelapi.com/lodging/'].find(item => value.startsWith(item));
  if (!prefix || /[?#]/.test(value) || /%2e|%2f|%5c|%25/i.test(value) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value)) return false;
  try {
    const url = new URL(value);
    return !url.port && !url.username && !url.password && !url.search && !url.hash && url.href.startsWith(prefix);
  } catch { return false; }
}
/** Supplier storage labels are not customer-facing photo descriptions. */
export function hotelPhotoCaption(value: unknown): string | undefined {
  const caption=hotelText(value);
  if(!caption||/^(?:cover|hero|property)?[ _-]*(?:image|photo)(?:[ _-]*\d+)?$/i.test(caption))return undefined;
  return caption;
}
function hotelPhotos(source: unknown): NonNullable<HotelPropertyDetails['photos']> {
  return (Array.isArray(source) ? source : []).slice(0, 30).flatMap(raw => {
    const photo = hotelObject(raw), links = hotelObject(photo.links);
    // Preserve Standard support; UAT static content supplies the observed XXL variant.
    const href = [hotelObject(links.Standard).href, hotelObject(links.XXL).href].find(safeHotelPhotoUrl);
    if (!href) return [];
    return [{url: href, ...(hotelPhotoCaption(photo.caption) ? {caption: hotelPhotoCaption(photo.caption)} : {}), isHero: photo.is_hero_image === true}];
  }).slice(0, 10);
}
/** Bulk Hotel API v3 content: hotels[].descriptions.headline and .default
 * (a JSON string with optional Overview/Snippet text), documented at
 * https://tripjack.com/page/api-doc#hotel-content. This is NOT the separate
 * static-detail schema. Descriptions are optional catalogue prose, never rates,
 * room inventory, cancellation promises or verified guest reviews. */
function hotelDescription(source: unknown): Pick<HotelPropertyDetails, 'descriptionHeadline' | 'description'> {
  const plain = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null) &&
      !Object.keys(value).some(key => ['__proto__', 'prototype', 'constructor'].includes(key));
  };
  if (!plain(source)) return {};
  const text = (value: unknown, max: number): string | undefined => {
    if (typeof value !== 'string' || value.length > 32000) return undefined;
    const entities: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', hellip: '…', copy: '©', reg: '®'};
    // Decode once, before removing markup, so encoded scripts are not displayed.
    // This is a conservative text projection, NOT an HTML sanitizer: consumers
    // MUST render the result as React text, never innerHTML.
    const decoded = value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== '#') return entities[name.toLowerCase()] ?? entity;
      const point = name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    });
    const cleaned = decoded
      .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
      .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
      .replace(/\s+/g, ' ').trim();
    // Broken markup is omitted rather than shown as a misleading description.
    return cleaned && !/[<>]/.test(cleaned) ? cleaned.slice(0, max) : undefined;
  };
  const headline = Object.hasOwn(source, 'headline') ? text(source.headline, 200) : undefined;
  let description: string | undefined;
  if (Object.hasOwn(source, 'default') && typeof source.default === 'string' && source.default.length <= 32000) {
    try {
      const parsed: unknown = JSON.parse(source.default);
      if (plain(parsed) && Object.values(parsed).every(value => typeof value === 'string')) {
        const overview = Object.hasOwn(parsed, 'Overview') ? text(parsed.Overview, 4000) : undefined;
        description = overview ?? (Object.hasOwn(parsed, 'Snippet') ? text(parsed.Snippet, 4000) : undefined);
      }
    } catch { /* Missing/malformed optional catalogue content remains unavailable. */ }
  }
  return {...(headline ? {descriptionHeadline: headline} : {}), ...(description ? {description} : {})};
}
export function hotelPropertyDetails(source: unknown): HotelPropertyDetails {
  const data = hotelObject(source), address = hotelObject(hotelObject(data.locale).address);
  const rating = typeof data.star_rating === 'string' || typeof data.star_rating === 'number' ? Number(data.star_rating) : NaN;
  const photos = hotelPhotos(data.images);
  return {
    ...hotelDescription(Object.hasOwn(data, 'descriptions') ? data.descriptions : undefined),
    ...(photos.length ? {photos} : {}),
    ...(Number.isInteger(rating) && rating >= 1 && rating <= 5 ? {starRating: rating} : {}),
    ...(hotelText(hotelObject(data.property_type).name) ? {propertyType: hotelText(hotelObject(data.property_type).name)} : {}),
    ...(hotelText(address.fulladdr, 1000) ? {address: hotelText(address.fulladdr, 1000)} : {}),
    amenities: hotelStringList(Object.values(hotelObject(data.amenities)).map(item => hotelObject(item).name)),
  };
}
/** Supplier timestamps without offsets use Asia/Kolkata, per hotel v3 docs. */
function policyTime(value: unknown): number {
  return supplierInstant(value,'+05:30') ?? NaN;
}
export function hotelCancellation(source: unknown): HotelCancellation {
  const data = hotelObject(source);
  const penalties = (Array.isArray(data.penalties) ? data.penalties : []).slice(0, 40).flatMap(raw => {
    const row = hotelObject(raw);
    if (typeof row.from !== 'string' || typeof row.to !== 'string' || !Number.isFinite(policyTime(row.from)) || policyTime(row.to) <= policyTime(row.from) || !Number.isFinite(policyTime(row.to)) || typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0) return [];
    return [{from: row.from, to: row.to, amount: row.amount}];
  });
  return {
    ...(typeof data.isRefundable === 'boolean' ? {isRefundable: data.isRefundable} : {}),
    // A partially malformed/truncated schedule cannot safely support a free-cancellation claim.
    penalties: Array.isArray(data.penalties) && penalties.length === data.penalties.length ? penalties : [],
    ...(Number.isFinite(policyTime(data.deadlineDateTime)) ? {deadlineDateTime: data.deadlineDateTime as string} : {}),
  };
}
export function hotelRoomInfo(source: unknown): {id?: string; name: string}[] {
  return (Array.isArray(source) ? source : []).slice(0, 4).flatMap(raw => {
    const room = hotelObject(raw), name = hotelText(room.name), id = hotelText(room.id);
    return name ? [{...(id ? {id} : {}), name}] : [];
  });
}
export function hotelRoomLabel(option: {roomInfo?: {name: string}[]}): string {
  const names = (option.roomInfo ?? []).map(room => room.name).filter(Boolean);
  return names.length ? names.join(' + ') : 'Room details not supplied';
}
/** Validate the entire schedule, not only rows active now: a future overlapping
 * charge must not let today's summary promise a longer zero-charge window.
 * Keep original normalized rows intact for the full supplier-policy disclosure. */
export function hotelCancellationScheduleIsUnambiguous(cancellation: HotelCancellation): boolean {
  const sorted = [...cancellation.penalties].sort((a,b) => policyTime(a.from)-policyTime(b.from));
  return sorted.length > 0 && sorted.every((row,index) => index===0 || policyTime(row.from)>=policyTime(sorted[index-1].to));
}
export function hotelCancellationLabel(source: unknown, now = Date.now()): string {
  const cancellation = hotelCancellation(source);
  const active = (hotelCancellationScheduleIsUnambiguous(cancellation) ? cancellation.penalties : []).filter(row => policyTime(row.from) <= now && now < policyTime(row.to));
  // No cancellation promise from a flag alone, ambiguous overlaps or a payment deadline.
  if (active.length === 1 && active[0].amount === 0 && cancellation.isRefundable !== false) {
    const end = new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}).format(policyTime(active[0].to));
    return `Supplier free-cancellation window until ${end} IST · review full terms`;
  }
  if (cancellation.isRefundable === false) return 'Non-refundable · review full terms';
  if (active.length === 1 && active[0].amount > 0) return 'Cancellation charges apply · review full terms';
  return 'Cancellation terms require review';
}

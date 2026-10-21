import { z } from 'zod';
import {packageMediaId} from './package-media';
import { safeHotelPhotoUrl } from './hotel-presentation';

const text = (max: number) => z.string().max(max);
const date = z.string().refine(value => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, 'Invalid calendar date');
export const packageSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(100);
const phone = z.string().regex(/^(?:\+[1-9]\d{6,14})?$/);
export const travelPackageSchema = z.object({
  id: text(200).min(1), slug: packageSlug, title: text(120).min(1), destination: text(120), summary: text(280), description: text(8000),
  durationDays: z.number().int().min(1).max(60), durationNights: z.number().int().min(0).max(60),
  priceAmount: z.number().positive().max(100000000).nullable(), currency: z.enum(['INR', 'USD', 'AED', 'EUR', 'GBP']),
  priceBasis: z.enum(['PER_PERSON', 'PER_COUPLE', 'PER_GROUP', 'ON_REQUEST']), priceNotes: text(1500), priceValidUntil: date,
  taxesIncluded: z.boolean(), availability: z.enum(['ON_REQUEST', 'SEASONAL', 'UNAVAILABLE']), travelStart: date, travelEnd: date, availabilityNotes: text(1500),
  itinerary: z.array(z.object({ day: z.number().int().min(1).max(60), title: text(160), description: text(2000) })).max(60),
  inclusions: z.array(text(500)).max(50), exclusions: z.array(text(500)).max(50), terms: text(6000), cancellationPolicy: text(4000),
  coverImageUrl: text(1500), coverImageAlt: text(180), gallery: z.array(z.object({url: text(1500), alt: text(180)})).max(12),
  contactEmail: z.union([z.email().max(160), z.literal('')]), contactPhone: phone, contactWhatsapp: phone, publishedAt: z.iso.datetime(),
});
export const travelPackageSummarySchema = travelPackageSchema.omit({description:true,itinerary:true,gallery:true,inclusions:true,exclusions:true,terms:true,cancellationPolicy:true,contactEmail:true,contactPhone:true,contactWhatsapp:true});
export type TravelPackageSummary = z.infer<typeof travelPackageSummarySchema>;
export type TravelPackage = z.infer<typeof travelPackageSchema>;
export function safePackagePhoto(value: string): boolean {
  if(packageMediaId(value))return true;
  if ((safeHotelPhotoUrl as (input: unknown) => boolean)(value)) return true;
  if (!value.startsWith('https://images.unsplash.com/photo-') || value.length > 1500 || /[\\\u0000-\u0020\u007f#]|%2e|%2f|%5c|%25/i.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://images.unsplash.com' || !/^\/photo-[a-zA-Z0-9-]+$/.test(url.pathname)) return false;
    const seen = new Set<string>();
    for (const [key, val] of url.searchParams) {
      if (seen.has(key)) return false;
      seen.add(key);
      if (key === 'auto' && val === 'format' || key === 'fit' && ['crop','max','clip'].includes(val)) continue;
      if (['w','h','q'].includes(key) && /^\d+$/.test(val) && Number(val) >= 1 && Number(val) <= (key === 'q' ? 100 : 4000)) continue;
      return false;
    }
    return true;
  } catch { return false; }
}
function projectPackage<T extends TravelPackageSummary>(p:T, now:Date):T {
  const today = now.toISOString().slice(0, 10);
  const priceCurrent = p.priceBasis !== 'ON_REQUEST' && p.priceAmount !== null && p.priceValidUntil >= today && Boolean(p.priceNotes.trim());
  return {...p, priceAmount: priceCurrent ? p.priceAmount : null, priceBasis: priceCurrent ? p.priceBasis : 'ON_REQUEST',
    availability: p.travelEnd && p.travelEnd < today ? 'UNAVAILABLE' : p.availability,
    coverImageUrl: safePackagePhoto(p.coverImageUrl) ? p.coverImageUrl : ''};
}
export function currentPackage(value:unknown,now=new Date()):TravelPackage { const p=travelPackageSchema.parse(value); return {...projectPackage(p,now),gallery:p.gallery.filter(item=>safePackagePhoto(item.url))}; }
export function currentPackageSummary(value:unknown,now=new Date()):TravelPackageSummary {return projectPackage(travelPackageSummarySchema.parse(value),now);}
export function packagePrice(p: TravelPackageSummary): string {
  return p.priceAmount === null || p.priceBasis === 'ON_REQUEST' ? 'Price on request' : new Intl.NumberFormat('en-IN', {style:'currency',currency:p.currency,minimumFractionDigits:0,maximumFractionDigits:2}).format(p.priceAmount);
}
export const packagePriceBasis = {PER_PERSON:'per person',PER_COUPLE:'per couple',PER_GROUP:'per group',ON_REQUEST:'Ask for a tailored quote'} as const;

/** Encode even valid email local-parts so percent signs cannot become URI headers. */
export function packageEmailHref(email:string,title:string,body:string):string {
 return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Package enquiry: ${title}`)}&body=${encodeURIComponent(body)}`;
}

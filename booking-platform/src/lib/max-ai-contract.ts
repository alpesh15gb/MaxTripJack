import type {EnquiryDraft} from './travel-enquiry-contract';
/** Public, browser-safe contract. Card actions are constructed by application tools, never the model. */
export type MaxAiAction = {label: string; href: string};
export type MaxAiCard = {
  id: string;
  type: 'flight' | 'hotel' | 'package' | 'trip';
  title: string;
  subtitle: string;
  details: string[];
  priceMinor?: number;
  currency?: string;
  basis?: string;
  action: MaxAiAction;
};
export type MaxAiResponse = {
  reply: string;
  cards: MaxAiCard[];
  actions: MaxAiAction[];
  conversationToken?: string;
  notice?: string;
  enquiryDraft?: EnquiryDraft;
};

const pages = new Set([
  '/', '/book', '/packages', '/my-trips', '/account', '/travellers', '/contact', '/customer-support',
  '/services', '/office', '/about', '/pricing-transparency', '/cancellations-payment-policy',
  '/privacy-policy', '/terms-and-conditions', '/flight-booking-guide', '/visa-guide',
  '/passport-renewal-guide', '/travel-insurance-guide', '/holiday-packages-guide', '/cruise-holidays-guide',
  '/operations', '/operations/settings', '/operations/promos', '/operations/reports', '/operations/visibility',
]);
const bookingKeys = new Set(['product','from','to','date','end','returnDate','adults','children','infants','cabin','city','nationality','hotelIds','regionId','rooms','legs','autoSearch','browseSearch','stay','flightSearch','flightStops','flightSort','flightAirlineQuery','destinationCursor']);
/** Defence in depth for rendering trusted cards. Never turn free-form assistant text into links. */
export function isMaxAiActionHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length > 2200 || !href.startsWith('/') || href.startsWith('//') || /[\\\u0000-\u0020\u007f#]/.test(href)) return false;
  try {
    const url = new URL(href, 'https://maxtravel.invalid');
    if (url.origin !== 'https://maxtravel.invalid' || url.hash) return false;
    const path = url.pathname;
    if (href.split('?',1)[0] !== path || path.includes('%')) return false;
    if (!pages.has(path) && !/^\/packages\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && !/^\/my-trips\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)) return false;
    if (path === '/book') {
      const seen = new Set<string>();
      for (const [key, value] of url.searchParams) {
        if (!bookingKeys.has(key) || seen.has(key) || value.length > 2000 || /[\u0000-\u001f\u007f]/.test(value)) return false;
        seen.add(key);
      }
      if (['flightStops','flightSort','flightAirlineQuery'].some(key => seen.has(key))) {
        if (url.searchParams.get('product') !== 'FLIGHT' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.searchParams.get('flightSearch') ?? '')) return false;
        if (seen.has('flightStops') && url.searchParams.get('flightStops') !== '0') return false;
        if (seen.has('flightSort') && !['price','duration','departure'].includes(url.searchParams.get('flightSort') ?? '')) return false;
        const carrier = url.searchParams.get('flightAirlineQuery');
        if (carrier !== null && (carrier.trim().length < 2 || carrier.length > 80)) return false;
      }
      return true;
    }
    if (path === '/account' && url.search) {
      return [...url.searchParams.keys()].length === 1 && url.searchParams.has('returnTo') && isMaxAiActionHref(url.searchParams.get('returnTo'));
    }
    return !url.search;
  } catch { return false; }
}

import {json} from '@/lib/http';
import {readFareDeals} from '@/lib/fare-calendar';
import {indiaToday} from '@/lib/booking-presentation';
import {homeDealRoutes} from '@/lib/home-deal-routes';

/** Public, read-only: recently verified lowest fares for the homepage deals. */
export async function GET() {
  try {
    const response = json({deals: await readFareDeals(homeDealRoutes, indiaToday())});
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return response;
  } catch {
    return json({deals: []});
  }
}

import 'server-only';
import {customerFlightResults, type PricingRule} from './customer-pricing';
import {lowestAdultFareMinor, type Cabin} from './fare-calendar-core';
import {exactAirportGroups} from './flight-airport-scope';
import {flightSearch, type Search} from './providers/contracts';
import {tripjackApiKey} from './providers/tripjack-key';

export type FlightAlertRoute = {from: string; to: string; date: string; cabin: Cabin};
const searchPath = '/fms/v1/air-search-all';
const nonProductionHost = /test|uat|sandbox|staging|stage|preprod|dev|(?:^|[-.])qa(?:[-.]|$)/i;

// Provision this endpoint and key from the TripJack partner team's production
// Air Search approval. This client intentionally exposes only Flight Search.
export function flightAlertProviderConfig(env: Readonly<Record<string,string|undefined>> = process.env) {
  const endpoint = env.TRIPJACK_PRICE_ALERT_SEARCH_URL?.trim();
  const key = env.TRIPJACK_PRICE_ALERT_API_KEY?.trim();
  if (env.FLIGHT_PRICE_ALERTS_ENABLED !== 'true' || !endpoint || !key ||
      key === tripjackApiKey('FLIGHT',env) || key === tripjackApiKey('HOTEL',env)) return null;
  let url: URL;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || endpoint !== url.origin + searchPath ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.tripjack\.com$/.test(url.hostname) ||
      nonProductionHost.test(url.hostname.split('.tripjack.com')[0])) return null;
  return {endpoint,key};
}

export async function observeProductionAlertFare(
  route: FlightAlertRoute,
  config: NonNullable<ReturnType<typeof flightAlertProviderConfig>>,
  pricingRule: PricingRule | undefined,
  request: typeof fetch = fetch,
) {
  const criteria: Extract<Search,{product:'FLIGHT'}> = {...route,product:'FLIGHT',adults:1,children:0,infants:0};
  const response = await request(config.endpoint,{
    method:'POST',
    headers:{apikey:config.key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(flightSearch(criteria)),
    signal:AbortSignal.timeout(15_000),
    redirect:'error',
    cache:'no-store',
  });
  if (!response.ok) throw new Error('Flight alert supplier search unavailable.');
  const result = await response.json();
  if (result?.status?.success !== true || !result.searchResult?.tripInfos ||
      typeof result.searchResult.tripInfos !== 'object' || Array.isArray(result.searchResult.tripInfos))
    throw new Error('Flight alert supplier response was incomplete.');
  const tripInfos = exactAirportGroups(result.searchResult.tripInfos,criteria);
  return lowestAdultFareMinor(customerFlightResults({searchResult:{tripInfos}},criteria,pricingRule),criteria);
}

import 'server-only';
import {database} from './db';
import {flightSearch, type Search} from './providers/contracts';
import {tripjack, paths} from './providers/tripjack';
import {cachedFlightSearch} from './flight-search-cache';
import {exactAirportGroups} from './flight-airport-scope';
import {customerFlightResults, type PricingRule} from './customer-pricing';
import {requestLimit} from './request-limit';
import {validateSearchCriteria} from './search-validation';
import {bandFares, fareCalendarDates, lowestAdultFareMinor, staleDates, type Cabin, type FareDay} from './fare-calendar-core';

// Matches supplier_searches provenance: the provider host is currently UAT.
const ENVIRONMENT = 'uat';
const CONCURRENT_REFRESHES = 6;
const MAX_PENDING_DATES = 45;
const MAX_QUEUE_AGE_MS = 45_000;
const SUPPLIER_CALLS_PER_MINUTE = 120;
const PEER_SUPPLIER_CALLS_PER_MINUTE = 45;

type Route = {from: string; to: string; cabin: Cabin};
type FlightCriteria = Extract<Search, {product: 'FLIGHT'}>;
type RefreshTask = {key: string; queuedAt: number; run: () => Promise<void>; finish: () => void};
type RefreshQueue = {active: number; queue: RefreshTask[]; pending: Map<string, Promise<void>>};
// Next production can bundle handlers separately. Reads and refreshes must see the same process queue.
const shared = globalThis as unknown as {maxtravelVerifiedFareRefresh?: RefreshQueue};
const refreshes: RefreshQueue = shared.maxtravelVerifiedFareRefresh ??= {active: 0, queue: [], pending: new Map()};
const dateKey = (route: Route, date: string) => `${route.from}-${route.to}-${route.cabin}-${date}`;

async function recordFareObservation(route: Route, date: string, minor: number | null) {
  await database().query(
    `INSERT INTO flight_fare_calendar_verified(origin_code,destination_code,cabin,departure_date,lowest_adult_minor,provider_environment,observed_at)
     VALUES($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT(origin_code,destination_code,cabin,departure_date,provider_environment)
     DO UPDATE SET lowest_adult_minor=EXCLUDED.lowest_adult_minor,observed_at=EXCLUDED.observed_at`,
    [route.from, route.to, route.cabin, date, minor, ENVIRONMENT],
  );
}

/** The interactive supplier search has already filtered these results by airports and departure day. */
export function observeSearchFare(criteria: FlightCriteria, customerResults: unknown, companyId: string | null) {
  if (companyId) return;
  const minor = lowestAdultFareMinor(customerResults, criteria);
  if (minor !== null) void recordFareObservation(criteria, criteria.date, minor).catch(() => {});
}

async function observed(route: Route, first: string, last: string): Promise<FareDay[]> {
  const result = await database().query<{departure_date: string; lowest_adult_minor: string | null; observed_at: Date}>(
    `SELECT to_char(departure_date,'YYYY-MM-DD') AS departure_date,lowest_adult_minor,observed_at
     FROM flight_fare_calendar_verified
     WHERE origin_code=$1 AND destination_code=$2 AND cabin=$3 AND provider_environment=$4
       AND departure_date BETWEEN $5::date AND $6::date`,
    [route.from, route.to, route.cabin, ENVIRONMENT, first, last],
  );
  return result.rows.map(row => ({
    date: row.departure_date,
    minor: row.lowest_adult_minor === null ? null : Number(row.lowest_adult_minor),
    observedAt: new Date(row.observed_at).getTime(),
  }));
}

export async function readFareCalendar(route: Route, start: string, days: number) {
  const dates = fareCalendarDates(start, days);
  // Snapshot pending first. Work finishing during the read may require one more
  // poll, but a finished date cannot be signalled before its stored fare is visible.
  const pending = dates.filter(date => refreshes.pending.has(dateKey(route, date)));
  const rows = await observed(route, start, dates[dates.length - 1]);
  return {days: bandFares(rows, Date.now()), pending};
}

// Same public pricing rule as the interactive flight search, including service fees.
async function publicFlightRule() {
  const rules = await database().query<PricingRule>(
    "SELECT * FROM pricing_rules WHERE active=true AND product='FLIGHT' AND company_id IS NULL ORDER BY created_at DESC LIMIT 1",
  );
  return rules.rows[0];
}

async function refreshDate(route: Route, date: string, peer: string, getRule: () => Promise<PricingRule | undefined>) {
  const criteria: FlightCriteria = {product: 'FLIGHT', ...route, date, adults: 1, children: 0, infants: 0};
  validateSearchCriteria(criteria);
  const rule = await getRule();
  // Bound individual dates, not just windows. Reserve before joining the shared
  // search cache so a denied background call cannot fail an interactive search.
  await requestLimit(`fare-calendar:peer:${peer}`, 'fare-calendar-date', PEER_SUPPLIER_CALLS_PER_MINUTE);
  await requestLimit('fare-calendar:global', 'fare-calendar-date', SUPPLIER_CALLS_PER_MINUTE);
  const payload = flightSearch(criteria);
  const data = await cachedFlightSearch(payload, () => tripjack('FLIGHT', paths.FLIGHT.search, payload));
  const tripInfos = exactAirportGroups(data.searchResult?.tripInfos, criteria);
  const customerResults = customerFlightResults({searchResult: {tripInfos}}, criteria, rule);
  // Null removes the old fare when a successful search yielded no validated
  // selectable price. A failed supplier request leaves prior evidence intact.
  await recordFareObservation(route, date, lowestAdultFareMinor(customerResults, criteria));
}

function runQueue() {
  while (refreshes.active < CONCURRENT_REFRESHES && refreshes.queue.length) {
    const task = refreshes.queue.shift()!;
    refreshes.active += 1;
    void (async () => {
      try {
        if (Date.now() - task.queuedAt < MAX_QUEUE_AGE_MS) await task.run();
      } catch {
        // Supplier or quota failures leave this date available for a direct search.
      } finally {
        refreshes.active -= 1;
        refreshes.pending.delete(task.key);
        task.finish();
        runQueue();
      }
    })();
  }
}

/** Reserve dates before returning 202 so repeated reads see every active date. */
export async function prepareFareCalendar(route: Route, dates: string[], anchor: string, peer: string) {
  const have = await observed(route, dates[0], dates[dates.length - 1]);
  const needed = staleDates(dates, have, Date.now());
  const anchorTime = Date.parse(anchor);
  needed.sort((a, b) => Math.abs(Date.parse(a) - anchorTime) - Math.abs(Date.parse(b) - anchorTime));
  let pricing: Promise<PricingRule | undefined> | undefined;
  const getRule = () => pricing ??= publicFlightRule();

  for (const date of needed) {
    if (refreshes.pending.size >= MAX_PENDING_DATES) break;
    const key = dateKey(route, date);
    if (refreshes.pending.has(key)) continue;
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    refreshes.pending.set(key, done);
    refreshes.queue.push({key, queuedAt: Date.now(), run: () => refreshDate(route, date, peer, getRule), finish});
  }

  const jobs = dates.flatMap(date => {
    const completion = refreshes.pending.get(dateKey(route, date));
    return completion ? [{date, completion}] : [];
  });
  runQueue();
  return {pending: jobs.map(job => job.date), finished: Promise.all(jobs.map(job => job.completion))};
}

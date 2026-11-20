import { bookingSearchUrl } from './booking-search-state';
import { fareCalendarWindow, FARE_CALENDAR_TIMELINE_DAYS } from './fare-calendar-core';

const DATE_RADIUS = Math.floor(FARE_CALENDAR_TIMELINE_DAYS / 2);
const DAY_MS = 86_400_000;
type DateSearch = {date:string;criteria:Record<string,string>;url:string};
export type FlightTimelineDay = {date:string;search:DateSearch|null};

function departureTime(criteria:Record<string,string>) {
  if (criteria.product !== 'FLIGHT' || criteria.legs || !/^\d{4}-\d{2}-\d{2}$/.test(criteria.date ?? '')) return null;
  const time = Date.parse(`${criteria.date}T00:00:00Z`);
  return Number.isFinite(time) && isoDay(time) === criteria.date ? time : null;
}

const isoDay = (time:number) => new Date(time).toISOString().slice(0,10);

function searchOnDate(criteria:Record<string,string>, date:string, today:string):DateSearch|null {
  if (date === criteria.date || date < today || (criteria.returnDate && date > criteria.returnDate)) return null;
  const search={...criteria};
  for(const key of ['browseSearch','flightSearch','flightStops','flightSort','flightAirlineQuery','stay','gallery','stayStep','selectionKey','resumeSelection','resumeReview'])delete search[key];
  const next={...search,date,autoSearch:'1'};
  const url=bookingSearchUrl(next,today);
  return url?{date,criteria:next,url}:null;
}

/** Date navigation uses submitted criteria only; an existing return is never moved. */
export function nearbyFlightSearch(criteria:Record<string,string>, offset:number, today:string):DateSearch|null {
  const departure = departureTime(criteria);
  if (departure === null || !Number.isInteger(offset) || Math.abs(offset) > DATE_RADIUS) return null;
  return searchOnDate(criteria, isoDay(departure + offset * DAY_MS), today);
}

export function flightDateTimeline(criteria:Record<string,string>, today:string):FlightTimelineDay[] {
  if (departureTime(criteria) === null) return [];
  return fareCalendarWindow(criteria.date, today).map(date => ({
    date, search: searchOnDate(criteria, date, today),
  }));
}

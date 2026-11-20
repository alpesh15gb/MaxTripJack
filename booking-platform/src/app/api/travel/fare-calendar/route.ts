import {after} from 'next/server';
import {z} from 'zod';
import {body, json, sameOrigin} from '@/lib/http';
import {prepareFareCalendar, readFareCalendar} from '@/lib/fare-calendar';
import {CABINS, FARE_CALENDAR_MAX_DAYS, FARE_CALENDAR_TIMELINE_DAYS, fareCalendarDates, fareCalendarWindow, isDay} from '@/lib/fare-calendar-core';
import {shoppingPeer} from '@/lib/guest-shopping-policy';
import {indiaToday} from '@/lib/booking-presentation';

export const maxDuration = 150;

const code = z.string().regex(/^[A-Z]{3}$/);
const route = z.object({from: code, to: code, cabin: z.enum(CABINS).default('ECONOMY')});
const refresh = route.extend({
  date: z.string().refine(isDay).optional(),
  start: z.string().refine(isDay).optional(),
  days: z.number().int().min(1).max(FARE_CALENDAR_TIMELINE_DAYS).optional(),
}).strict().refine(value => value.start ? value.days !== undefined : Boolean(value.date) && value.days === undefined);

const empty = (status = 200) => json({days: {}, pending: []}, status);
const skipped = () => new Response(null, {status: 204, headers: {'Cache-Control': 'private, no-store'}});

/** Read verified prices. Polls bypass caches so each completed date can appear. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = route.safeParse({from: params.get('from')?.toUpperCase(), to: params.get('to')?.toUpperCase(), cabin: params.get('cabin') ?? undefined});
  if (!parsed.success || parsed.data.from === parsed.data.to) return empty();
  const count = Number(params.get('days') ?? 45);
  if (!Number.isSafeInteger(count) || count < 1) return empty();
  const days = Math.min(FARE_CALENDAR_MAX_DAYS, count);
  const today = indiaToday();
  const requested = params.get('start');
  const start = isDay(requested) && requested >= today ? requested : today;
  const dates = fareCalendarDates(start, days);
  if (!isDay(dates[dates.length - 1])) return empty();
  try {
    return json(await readFareCalendar(parsed.data, start, days));
  } catch {
    return empty(503);
  }
}

/** Refresh the requested visible dates without blocking the flight search. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (process.env.SEARCH_PREWARM_ENABLED === 'false') return skipped();
    const input = await body(request, refresh);
    const today = indiaToday();
    if (input.from === input.to || (input.start && input.start < today)) return skipped();
    const anchor = input.date && input.date >= today ? input.date : input.start ?? today;
    const dates = input.start ? fareCalendarDates(input.start, input.days!) : fareCalendarWindow(anchor, today);
    if (!isDay(dates[dates.length - 1])) return skipped();
    const {pending, finished} = await prepareFareCalendar(
      {from: input.from, to: input.to, cabin: input.cabin},
      dates,
      anchor,
      shoppingPeer(request, process.env.PUBLIC_SHOPPING_TRUST_PROXY === 'true'),
    );
    if (!pending.length) return skipped();
    after(() => finished.then(() => undefined));
    return json({pending}, 202);
  } catch {
    return skipped();
  }
}

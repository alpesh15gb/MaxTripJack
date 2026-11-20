'use client';

import {useEffect, useState} from 'react';
import {addDays, FARE_CALENDAR_MAX_DAYS, isDay, type FareCalendarDay} from '@/lib/fare-calendar-core';

type Calendar = {days: Record<string, FareCalendarDay>; pending: string[]};
type StoredCalendar = {key: string; calendar: Calendar};

const empty: Calendar = {days: {}, pending: []};
const memory = new Map<string, {at: number; calendar: Calendar}>();
const reuseForMs = 30_000;
const pollDelays = [1_200, 2_200, 3_500, 5_000, 6_000];
const pendingPollIntervalMs = 8_000;
// Allow a queued date to reach the supplier and finish its bounded request.
const pollingBudgetMs = 100_000;
const requestTimeoutMs = 6_000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isFare(value: unknown): value is FareCalendarDay {
  const {minor, band} = record(value);
  return typeof minor === 'number' && Number.isSafeInteger(minor) && minor > 0 &&
    (band === 'low' || band === 'mid' || band === 'high');
}

export default function useFareCalendar({from, to, cabin, start, days, anchor, enabled = true}: {
  from: string; to: string; cabin: string; start: string; days: number; anchor?: string; enabled?: boolean;
}): Calendar {
  const key = `${from}:${to}:${cabin}:${start}:${days}`;
  const valid = enabled && /^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to) && from !== to &&
    isDay(start) && Number.isInteger(days) && days > 0 && days <= FARE_CALENDAR_MAX_DAYS;
  const [state, setState] = useState<StoredCalendar>();

  useEffect(() => {
    if (!valid) return;

    const controller = new AbortController();
    const {signal} = controller;
    const requestSignal = () => AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]);
    const pollUntil = Date.now() + pollingBudgetMs;
    const end = addDays(start, days - 1);
    const inWindow = (date: unknown): date is string => isDay(date) && date >= start && date <= end;
    const pendingDates = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(inWindow))] : [];
    const query = new URLSearchParams({from, to, cabin, start, days: String(days)});
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function read(): Promise<Calendar | null> {
      try {
        const response = await fetch(`/api/travel/fare-calendar?${query}`, {cache: 'no-store', signal: requestSignal()});
        if (!response.ok) return null;
        const data = record(await response.json());
        if (data.days === null || typeof data.days !== 'object' || Array.isArray(data.days)) return null;
        const fares: Calendar['days'] = {};
        for (const [date, fare] of Object.entries(record(data.days))) {
          if (inWindow(date) && isFare(fare)) fares[date] = fare;
        }
        return {days: fares, pending: pendingDates(data.pending)};
      } catch {
        return null;
      }
    }

    function publish(calendar: Calendar, complete: boolean) {
      if (signal.aborted) return;
      setState({key, calendar});
      if (complete) {
        memory.delete(key);
        memory.set(key, {at: Date.now(), calendar});
        if (memory.size > 40) {
          const oldest = memory.keys().next().value;
          if (oldest !== undefined) memory.delete(oldest);
        }
      }
    }

    function follow(calendar: Calendar, attempt: number, forceRead = false) {
      if (signal.aborted) return;
      const delay = pollDelays[attempt] ?? pendingPollIntervalMs;
      if (Date.now() + delay >= pollUntil || (calendar.pending.length === 0 && !forceRead)) {
        publish({...calendar, pending: []}, true);
        return;
      }
      publish(calendar, false);
      timer = setTimeout(async () => {
        const next = await read();
        follow(next ?? calendar, attempt + 1);
      }, delay);
    }

    async function refresh(calendar: Calendar) {
      try {
        const response = await fetch('/api/travel/fare-calendar', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({from, to, cabin, start, days, date: anchor}),
          signal: requestSignal(),
        });
        if (response.status === 202) {
          const data = record(await response.json().catch(() => null));
          follow({...calendar, pending: pendingDates(data.pending)}, 0, true);
          return;
        }
      } catch {
        // Keep the current observations if starting a refresh fails.
      }
      follow(calendar, 0);
    }

    async function begin() {
      const cached = memory.get(key);
      if (cached && Date.now() - cached.at < reuseForMs) {
        publish(cached.calendar, false);
        return;
      }
      const calendar = await read();
      if (signal.aborted) return;
      if (!calendar) {
        setState(previous => ({
          key,
          calendar: previous?.key === key ? {...previous.calendar, pending: []} : empty,
        }));
        return;
      }
      if (!isDay(anchor)) {
        publish(calendar, calendar.pending.length === 0);
        return;
      }
      publish(calendar, false);
      timer = setTimeout(() => void refresh(calendar), 350);
    }

    void begin();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [valid, key, from, to, cabin, start, days, anchor]);

  if (!valid) return empty;
  return state?.key === key ? state.calendar : empty;
}

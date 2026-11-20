'use client';

import {useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent} from 'react';
import type {FlightTimelineDay} from '@/lib/nearby-flight-dates';
import {travelDateLabel} from '@/lib/travel-date';
import {compactRupees,type FareCalendarDay} from '@/lib/fare-calendar-core';

const weekday = new Intl.DateTimeFormat('en-GB', {weekday: 'short', timeZone: 'UTC'});
const month = new Intl.DateTimeFormat('en-GB', {month: 'short', timeZone: 'UTC'});

export default function FlightDateTimeline({days, selectedDate, returnDate, pendingDate, disabled, onPrepare, onSelect, fares = {}}: {
  fares?: Record<string, FareCalendarDay>;
  days: FlightTimelineDay[];
  selectedDate: string;
  returnDate?: string;
  pendingDate: string|null;
  disabled: boolean;
  onPrepare: (criteria: Record<string, string>) => void;
  onSelect: (criteria: Record<string, string>) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const priceNoteId = useId();
  const warmTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const restoreFocus = useRef(false);
  const [focusedDate, setFocusedDate] = useState(selectedDate);
  const [scroll, setScroll] = useState({earlier: false, later: false});
  const hasIndicativeFares = days.some(day => Boolean(fares[day.date]));
  const tabDate = days.some(day => day.date === focusedDate && (day.search || day.date === selectedDate)) ? focusedDate : selectedDate;

  const cancelWarm = useCallback(() => {
    if (warmTimer.current !== null) clearTimeout(warmTimer.current);
    warmTimer.current = null;
  }, []);

  function prepare(day: FlightTimelineDay) {
    cancelWarm();
    if (!day.search || disabled) return;
    const {criteria} = day.search;
    // A brief pause distinguishes comparing a day from moving across the strip.
    warmTimer.current = setTimeout(() => onPrepare(criteria), 220);
  }

  const syncArrows = useCallback(() => {
    const node = track.current;
    if (!node) return;
    const earlier = node.scrollLeft > 2;
    const later = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
    setScroll(current => current.earlier === earlier && current.later === later ? current : {earlier, later});
  }, []);

  useLayoutEffect(() => {
    const node = track.current;
    if (!node) return;
    const centerDate = () => {
      const current = node.querySelector<HTMLElement>('[aria-current="date"]');
      if (current) node.scrollLeft = current.offsetLeft + (current.offsetWidth - node.clientWidth) / 2;
      syncArrows();
    };
    centerDate();
    const observer = new ResizeObserver(centerDate);
    observer.observe(node);
    return () => { observer.disconnect(); cancelWarm(); };
  }, [selectedDate, syncArrows, cancelWarm]);

  useLayoutEffect(() => {
    if (disabled || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body || track.current?.contains(document.activeElement)) {
      track.current?.querySelector<HTMLButtonElement>('[aria-current="date"]')?.focus({preventScroll: true});
    }
  }, [disabled, selectedDate]);

  function browse(direction: number) {
    const node = track.current;
    if (!node) return;
    cancelWarm();
    node.scrollBy({left: direction * node.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1);
    buttons[target]?.focus();
  }

  return <nav className="flight-date-timeline" aria-label="Nearby departure dates" aria-describedby={hasIndicativeFares ? priceNoteId : undefined}>
    <div className="flight-date-header">
      <div>
        <h3>Departure dates</h3>
        {hasIndicativeFares && <p id={priceNoteId} className="flight-date-price-note">Recent from fares · per adult</p>}
        {returnDate && <p>Return stays {travelDateLabel(returnDate)}</p>}
      </div>
      {(scroll.earlier || scroll.later) && <div className="flight-date-arrows">
        <button type="button" aria-label="Earlier dates" disabled={!scroll.earlier} onClick={() => browse(-1)}>‹</button>
        <button type="button" aria-label="Later dates" disabled={!scroll.later} onClick={() => browse(1)}>›</button>
      </div>}
    </div>
    <div ref={track} className="flight-date-track" data-flight-date-track onScroll={syncArrows} onKeyDown={moveFocus}>
      {days.map(day => {
        const current = day.date === selectedDate;
        const pending = day.date === pendingDate;
        const value = new Date(`${day.date}T00:00:00Z`);
        const week = weekday.format(value);
        const fare = fares[day.date];
        return <button key={day.date} type="button" className="flight-date-day"
          data-flight-date={day.date} data-pending={pending || undefined}
          aria-label={`${travelDateLabel(day.date)}, ${week}${fare ? `, indicative fare from ₹${Math.round(fare.minor / 100).toLocaleString('en-IN')} per adult${fare.band === 'low' ? ', one of the lowest fares' : ''}` : ''}`}
          aria-current={current ? 'date' : undefined} aria-disabled={current || undefined}
          disabled={disabled || (!current && !day.search)} tabIndex={day.date === tabDate ? 0 : -1}
          onPointerEnter={event => { if (event.pointerType === 'mouse') prepare(day); }} onPointerLeave={cancelWarm}
          onFocus={event => { setFocusedDate(day.date); if (event.currentTarget.matches(':focus-visible')) prepare(day); }} onBlur={cancelWarm}
          onClick={event => {
            if (!day.search) return;
            cancelWarm();
            restoreFocus.current = event.detail === 0;
            onSelect(day.search.criteria);
          }}>
          <span>{week}</span>
          <time dateTime={day.date}><strong>{value.getUTCDate()}</strong> {month.format(value)}</time>
          <small className={fare ? `flight-date-fare fare-band-${fare.band}` : 'flight-date-fare'} aria-hidden="true">{fare ? `₹${compactRupees(fare.minor)}` : ' '}</small>
        </button>;
      })}
    </div>
  </nav>;
}

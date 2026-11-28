'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import { StitchSymbol } from './stitch-symbol';
import { TravelIcon } from './travel-icon';

const storageKey = 'maxtravel.recent-searches.v1';
const changeEvent = 'maxtravel:recent-searches';
const searchFields = new Set([
  'product', 'autoSearch', 'date', 'end', 'adults', 'from', 'to', 'cabin',
  'children', 'infants', 'returnDate', 'city', 'regionId', 'nationality',
]);
type RecentSearch = { label: string; query: string };

function searchQuery(params: URLSearchParams) {
  const saved = new URLSearchParams(Array.from(params).filter(([key]) => searchFields.has(key)));
  // Always remap a saved hotel search from the beginning of its destination.
  if (saved.get('product') === 'HOTEL') {
    if (/^\d{1,30}$/.test(saved.get('regionId') ?? '')) saved.set('destinationCursor', '0:0');
    else saved.delete('autoSearch');
  }
  return saved;
}

function snapshot() {
  try { return window.sessionStorage.getItem(storageKey) ?? ''; }
  catch { return ''; }
}

function subscribe(update: () => void) {
  window.addEventListener(changeEvent, update);
  return () => window.removeEventListener(changeEvent, update);
}

function decode(value: string): RecentSearch[] {
  if (!value || value.length > 5000) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentSearch =>
      typeof item?.label === 'string' && item.label.length <= 100 &&
      typeof item?.query === 'string' && item.query.length <= 800
    ).slice(0, 4);
  } catch { return []; }
}

const shortDate = new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
function displayDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = Date.parse(value);
  return Number.isFinite(date) ? shortDate.format(date) : '';
}

export function rememberHomeSearch(params: URLSearchParams, label: string) {
  const saved = searchQuery(params);
  // A hotel destination can be resolved again from its city or region. Avoid
  // storing opaque mapping cursors, supplier references, or customer details.
  const entry = { label: label.trim().slice(0, 100), query: saved.toString() };
  try {
    const previous = decode(snapshot()).filter(item => item.query !== entry.query);
    window.sessionStorage.setItem(storageKey, JSON.stringify([entry, ...previous].slice(0, 4)));
    window.dispatchEvent(new Event(changeEvent));
  } catch { /* Search works even when browser storage is unavailable. */ }
}

export default function HomeRecentSearches() {
  const recent = decode(useSyncExternalStore(subscribe, snapshot, () => ''));
  if (!recent.length) return null;
  function clear() {
    try {
      window.sessionStorage.removeItem(storageKey);
      window.dispatchEvent(new Event(changeEvent));
    } catch { /* Storage can be unavailable in a private browser. */ }
  }
  return (
    <section className="atlas-recent stitch-home-wrap" aria-labelledby="atlas-recent-title">
      <header>
        <h2 id="atlas-recent-title"><TravelIcon name="clock" size={19}/>Your recent searches</h2>
        <button type="button" onClick={clear}>Clear recent searches</button>
      </header>
      <div>
        {recent.map(item => {
          const params = searchQuery(new URLSearchParams(item.query));
          const hotel = params.get('product') === 'HOTEL';
          const start = displayDate(params.get('date'));
          const end = displayDate(params.get(hotel ? 'end' : 'returnDate'));
          const travellers = Number(params.get('adults') ?? 1) + Number(params.get('children') ?? 0) + Number(params.get('infants') ?? 0);
          return <Link key={item.query} aria-label={item.label} prefetch={false} href={{ pathname: '/book', query: Object.fromEntries(params) }}>
            <Image className="destina-recent-image" src={hotel ? '/travel/destina-perk-package.jpg' : '/travel/destina-hero.jpg'} width={440} height={248} alt="" sizes="221px"/>
            <span className="destina-recent-tag"><StitchSymbol name={hotel ? 'hotel' : 'flight'} size={13}/>{hotel ? 'Hotel' : 'Flight'}</span>
            <span className="destina-recent-label"><strong>{item.label}</strong><small>{[start && end ? `${start} – ${end}` : start, `${travellers} ${hotel ? 'guest' : 'traveller'}${travellers === 1 ? '' : 's'}`, !hotel && (end ? 'Round trip' : 'One way')].filter(Boolean).join(' · ')}</small></span>
          </Link>;
        })}
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
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
        <h2 id="atlas-recent-title">Recent searches</h2>
        <button type="button" onClick={clear}>Clear recent searches</button>
      </header>
      <div>
        {recent.map(item => (
          <Link key={item.query} prefetch={false} href={{ pathname: '/book', query: Object.fromEntries(searchQuery(new URLSearchParams(item.query))) }}>
            <TravelIcon name="search" size={17} />{item.label}<TravelIcon name="arrow" size={16} />
          </Link>
        ))}
      </div>
    </section>
  );
}

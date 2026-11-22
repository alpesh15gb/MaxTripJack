import type { FlightSearchCacheStatus } from './flight-search-cache';
/** Fixed aggregate stage names only: never include criteria, identifiers or provider data. */
export type SearchStage = 'access' | 'limit' | 'supplier' | 'pricing' | 'persist' | 'projection' | 'serialize';
export class SearchTiming {
 private readonly started: number;
 private readonly durations = new Map<SearchStage, number>();
 private flightCacheStatus?: FlightSearchCacheStatus;
 private hotelCacheStatus?: FlightSearchCacheStatus;
 private warmCacheStatus?: 'miss'|'hit'|'joined';
 constructor(private readonly now: () => number = () => performance.now()) { this.started = now(); }
 async measure<T>(stage: SearchStage, work: () => Promise<T>): Promise<T> {
  const start = this.now();
  try { return await work(); } finally { this.durations.set(stage, Math.max(0, this.now() - start)); }
 }
 sync<T>(stage: SearchStage, work: () => T): T {
  const start = this.now();
  try { return work(); } finally { this.durations.set(stage, Math.max(0, this.now() - start)); }
 }
 flightCache(status: FlightSearchCacheStatus) { this.flightCacheStatus = status; }
 hotelCache(status: FlightSearchCacheStatus) { this.hotelCacheStatus = status; }
 warmCache(status:'miss'|'hit'|'joined'){this.warmCacheStatus=status;}
 header() { return [...[...this.durations, ['total', Math.max(0, this.now() - this.started)] as const].map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`), ...(this.flightCacheStatus ? [`flight_cache;desc="${this.flightCacheStatus}"`] : []),...(this.hotelCacheStatus?[`hotel_cache;desc="${this.hotelCacheStatus}"`]:[]),...(this.warmCacheStatus?[`search_warm;desc="${this.warmCacheStatus}"`]:[])].join(', '); }
}

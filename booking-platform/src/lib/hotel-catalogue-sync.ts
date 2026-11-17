import {createHash} from 'node:crypto';
import {catalogueHotelId, catalogueText, normaliseCatalogueHotel, type HotelCatalogueEnvironment} from './hotel-catalogue';
import {type createHotelCatalogueRepository, type HotelCatalogueSyncState} from './hotel-catalogue-repository';

export type HotelCatalogueClient = {
  countries(): Promise<unknown>;
  mapping(countryName:string,page:number): Promise<unknown>;
  content(hotelIds:string[]): Promise<unknown>;
};
type Repository = ReturnType<typeof createHotelCatalogueRepository>;
type Atomic = <T>(work:()=>Promise<T>)=>Promise<T>;
const object = (value:unknown):Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};

export function catalogueCountries(response: unknown): string[] {
  const input = object(response).hotelCountries;
  if (!Array.isArray(input) || !input.length || input.length > 1_000) throw new Error('Invalid country catalogue response.');
  if (input.some(value => typeof value !== 'string' || value.length > 120 || catalogueText(value,120) !== value.trim() || value.trim().length < 2)) throw new Error('Invalid country catalogue entry.');
  return [...new Set(input.map(value=>String(value).trim()))];
}

export function catalogueMapping(response: unknown, page: number) {
  const data = object(response), rows = data.hotels;
  if (!Array.isArray(rows) || rows.length > 2_000) throw new Error('Invalid hotel mapping response.');
  const ids = rows.map(raw=>catalogueHotelId(object(raw).tjHotelId));
  if (ids.some(id=>!id)) throw new Error('Invalid mapped hotel identity.');
  const totalValue = object(data.pageable).totalPages;
  const totalPages = typeof totalValue === 'number' ? totalValue : typeof totalValue === 'string' && /^\d{1,6}$/.test(totalValue) ? Number(totalValue) : undefined;
  if (totalValue !== undefined && totalValue !== null && (totalPages === undefined || !Number.isInteger(totalPages) || totalPages < 0 || totalPages > 100_000)) throw new Error('Invalid mapping pagination.');
  if (totalPages !== undefined && ((totalPages === 0 && rows.length > 0) || (totalPages > 0 && page >= totalPages && rows.length > 0))) throw new Error('Inconsistent mapping pagination.');
  // Full pages without metadata must not silently truncate a country's remaining hotels.
  return {hotelIds:[...new Set(ids as string[])],hasMore:totalPages !== undefined ? page+1<totalPages : rows.length===2_000};
}

function contentRows(response:unknown, requested:string[]) {
  const rows = object(response).hotels;
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('Invalid bulk hotel content response.');
  const allowed = new Set(requested), seen = new Set<string>();
  for (const row of rows) {
    const id = catalogueHotelId(object(row).tjHotelId);
    if (!id || !allowed.has(id) || seen.has(id)) throw new Error('Unexpected bulk hotel identity.');
    seen.add(id);
  }
  return rows;
}

/** Reorder only at a page boundary. A loaded page belongs to its original country
 * until every pending content batch is committed. The completed prefix is never
 * moved; one deferred cursor preserves the remaining pages while India runs. */
function indiaFirstCheckpoint(state:HotelCatalogueSyncState):HotelCatalogueSyncState {
  if (state.completedAt || state.pageLoaded) return state;
  const country = state.countries[state.countryIndex];
  if (!country) throw new Error('Catalogue country checkpoint is invalid.');
  if (state.pendingIds.length || state.contentOffset) throw new Error('Catalogue page boundary is invalid.');
  if (state.deferredCountry) {
    const deferred = state.deferredCountry;
    if (country === deferred.countryName) {
      // India has finished. Restore the exact next page and repeated-page guard
      // in the same transaction that advances the country checkpoint.
      if (state.mappingPage !== 0) throw new Error('Deferred country checkpoint is invalid.');
      return {...state,mappingPage:deferred.mappingPage,lastMappingHash:deferred.lastMappingHash,deferredCountry:undefined};
    }
    if (country.toUpperCase() !== 'INDIA' || state.countries[state.countryIndex+1] !== deferred.countryName) throw new Error('Deferred country checkpoint is invalid.');
    return state;
  }
  const indiaIndex = state.countries.findIndex(value=>value.toUpperCase() === 'INDIA');
  // Missing/already-completed/current India needs no intervention.
  if (indiaIndex <= state.countryIndex) return state;
  const countries = [...state.countries.slice(0,state.countryIndex),state.countries[indiaIndex],
    ...state.countries.slice(state.countryIndex,indiaIndex),...state.countries.slice(indiaIndex+1)];
  return {...state,countries,mappingPage:0,lastMappingHash:undefined,
    ...(state.mappingPage>0 ? {deferredCountry:{countryName:country,mappingPage:state.mappingPage,...(state.lastMappingHash ? {lastMappingHash:state.lastMappingHash} : {})}} : {})};
}

/** All country pages are traversed; progress survives a process restart after every content batch.
 * The caller owns a single-worker lock and transaction boundary. No CRM or booking calls exist here. */
export async function syncHotelCatalogue(options: {
  repository:Repository;
  client:HotelCatalogueClient;
  environment:HotelCatalogueEnvironment;
  maxPages?:number;
  refresh?:boolean;
  atomic:Atomic;
  now?:()=>Date;
  progress?:(event:{kind:string;pages:number;countryIndex:number;countries:number;hotelCount?:number})=>void;
}) {
  const {repository:repo,client,environment,atomic} = options;
  const now = options.now ?? (()=>new Date());
  const maxPages = options.maxPages ?? 2;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Choose 1 to 100 mapping pages per run.');
  let state = await repo.readSync();
  if (options.refresh && state && !state.completedAt) throw new Error('Finish the current catalogue generation before refreshing.');
  if (!state || options.refresh) {
    const countries = catalogueCountries(await client.countries());
    state = indiaFirstCheckpoint({environment,countries,countryIndex:0,mappingPage:0,pendingIds:[],contentOffset:0,mappingHasMore:false,pageLoaded:false,
      generation:(state?.generation ?? 0)+1,mappedCount:0,contentCount:0,missingCount:0});
    const initial = state;
    await atomic(()=>repo.writeSync(initial));
  }
  const prioritised = indiaFirstCheckpoint(state);
  if (prioritised !== state) {
    await atomic(()=>repo.writeSync(prioritised));
    state = prioritised;
  }
  let pages = 0, retries = 0;
  async function persistContent(ids:string[],country:string,checkpoint:HotelCatalogueSyncState) {
    const rows = contentRows(await client.content(ids),ids);
    const projected = rows.map(row=>normaliseCatalogueHotel(row,country,environment));
    if (projected.some(row=>!row)) throw new Error('Invalid hotel content identity.');
    const next = {...checkpoint};
    await atomic(async()=>{
      const accepted:string[] = [];
      for (const row of projected) if (row && await repo.upsert(row)) accepted.push(row.hotelId);
      const acceptedSet = new Set(accepted), missing = ids.filter(id=>!acceptedSet.has(id));
      await repo.markFetched(accepted,checkpoint.generation);
      await repo.markMissing(missing);
      next.contentCount += accepted.length;
      next.missingCount += missing.length;
      await repo.writeSync(next);
    });
    return next;
  }
  while (!state.completedAt && pages < maxPages) {
    const country = state.countries[state.countryIndex];
    if (!country) throw new Error('Catalogue country checkpoint is invalid.');
    if (!state.pageLoaded) {
      if (state.mappingPage > 100_000) throw new Error('Catalogue mapping pagination limit exceeded.');
      const mapped = catalogueMapping(await client.mapping(country,state.mappingPage),state.mappingPage);
      const mappingHash=createHash('sha256').update(JSON.stringify([...mapped.hotelIds].sort())).digest('hex');
      if(mapped.hotelIds.length && state.mappingPage>0 && mappingHash===state.lastMappingHash) throw new Error('Supplier repeated a hotel mapping page.');
      const next = {...state,pendingIds:[] as string[],contentOffset:0,mappingHasMore:mapped.hasMore,pageLoaded:true,mappedCount:state.mappedCount+mapped.hotelIds.length,lastMappingHash:mappingHash};
      await atomic(async()=>{
        next.pendingIds = await repo.discover(mapped.hotelIds,country,next.generation);
        await repo.writeSync(next);
      });
      state = next;
    }
    while (state.contentOffset < state.pendingIds.length) {
      const ids = state.pendingIds.slice(state.contentOffset,state.contentOffset+100);
      state = await persistContent(ids,country,{...state,contentOffset:state.contentOffset+ids.length});
      options.progress?.({kind:'content',pages,countryIndex:state.countryIndex,countries:state.countries.length,hotelCount:ids.length});
    }
    let next:HotelCatalogueSyncState = {...state,pendingIds:[],contentOffset:0,pageLoaded:false,mappingHasMore:false,
      countryIndex:state.mappingHasMore ? state.countryIndex : state.countryIndex+1,
      mappingPage:state.mappingHasMore ? state.mappingPage+1 : 0,lastMappingHash:state.mappingHasMore ? state.lastMappingHash : undefined};
    if (next.countryIndex === next.countries.length) next.completedAt = now().toISOString();
    next = indiaFirstCheckpoint(next);
    await atomic(()=>repo.writeSync(next));
    state = next;
    pages++;
    options.progress?.({kind:'mapping-page',pages,countryIndex:state.countryIndex,countries:state.countries.length});
  }
  // Missing supplier content stays in the discovery queue. Retry due batches even after mapping completes.
  // Bound retries separately by maxPages; an empty supplier response receives a one-hour retry delay.
  if (state.completedAt) {
    while (retries < maxPages) {
      const pending = await repo.pendingContent(state.generation,100);
      if (!pending?.hotelIds.length) break;
      state = await persistContent(pending.hotelIds,pending.country,state);
      retries++;
    }
  }
  return {pages,retryBatches:retries,mappingComplete:Boolean(state.completedAt),generation:state.generation,stats:await repo.stats()};
}

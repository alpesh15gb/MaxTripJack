import {createHash} from 'node:crypto';
import {catalogueHotelId, HOTEL_CATALOGUE_FRESH_DAYS, HOTEL_CATALOGUE_SITEMAP_SIZE, type HotelCatalogueContent, type HotelCatalogueEnvironment, type HotelCatalogueRecord} from './hotel-catalogue';

export type CatalogueQuery = (sql: string, values?: unknown[]) => Promise<{rows: Record<string,unknown>[]} >;
export type HotelCatalogueSyncState = {
  environment: HotelCatalogueEnvironment;
  countries: string[];
  countryIndex: number;
  mappingPage: number;
  pendingIds: string[];
  contentOffset: number;
  mappingHasMore: boolean;
  pageLoaded: boolean;
  lastMappingHash?: string;
  generation: number;
  mappedCount: number;
  contentCount: number;
  missingCount: number;
  completedAt?: string;
};
export type HotelCatalogueStats = {
  available: boolean;
  environment: HotelCatalogueEnvironment;
  total: number;
  indexableTotal: number;
  productionIndexableTotal: number;
  updatedAt?: string;
  countriesTotal: number;
  countriesCompleted: number;
  mappedHotels: number;
  contentFetched: number;
  missingContent: number;
  lastSyncAt?: string;
  syncComplete: boolean;
};

const instant = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonicalJson(item)).join(',') + '}';
  return JSON.stringify(value);
}
function record(row: Record<string,unknown>): HotelCatalogueRecord {
  if (!row.content || typeof row.content !== 'object' || Array.isArray(row.content)) throw new Error('Invalid catalogue record.');
  return {...row.content as HotelCatalogueContent, hotelId:String(row.hotel_id),slug:String(row.slug),
    environment:row.environment as HotelCatalogueEnvironment, active:row.active === true, contentReady:row.content_ready === true,
    contentUpdatedAt:instant(row.content_updated_at),checkedAt:instant(row.checked_at)};
}
const fresh = `active=true AND content_ready=true AND checked_at > $2::timestamptz - interval '${HOTEL_CATALOGUE_FRESH_DAYS} days' AND checked_at <= $2::timestamptz + interval '5 minutes'`;

/** Shared SQL implementation is also exercised against isolated PostgreSQL-compatible PGlite. */
export function createHotelCatalogueRepository(query: CatalogueQuery, environment: HotelCatalogueEnvironment, now: () => Date = () => new Date()) {
  async function get(hotelId: string): Promise<HotelCatalogueRecord | undefined> {
    if (!catalogueHotelId(hotelId)) return undefined;
    const result = await query('SELECT * FROM hotel_catalogue WHERE environment=$1 AND hotel_id=$2',[environment,hotelId]);
    return result.rows[0] ? record(result.rows[0]) : undefined;
  }
  async function list(input: {page?:number;pageSize?:number;query?:string} = {}) {
    const page = Math.max(1,Math.min(1_000_000,Math.trunc(input.page || 1)));
    const pageSize = Math.max(1,Math.min(100,Math.trunc(input.pageSize || 24)));
    const search = (input.query || '').trim().slice(0,100);
    const values: unknown[] = [environment,now().toISOString()];
    const where = `environment=$1 AND ${fresh}` + (search ? " AND search_document @@ plainto_tsquery('simple',$3)" : '');
    if (search) values.push(search);
    const [found,count] = await Promise.all([
      query(`SELECT * FROM hotel_catalogue WHERE ${where} ORDER BY name,hotel_id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,pageSize,(page-1)*pageSize]),
      query(`SELECT count(*)::text AS total FROM hotel_catalogue WHERE ${where}`,values),
    ]);
    return {available:true,hotels:found.rows.map(record),total:Number(count.rows[0]?.total || 0)};
  }
  async function sitemap(shard: number, limit = HOTEL_CATALOGUE_SITEMAP_SIZE) {
    if (environment !== 'production' || !Number.isInteger(shard) || shard < 0 || shard > 100_000 || !Number.isInteger(limit) || limit < 1 || limit > HOTEL_CATALOGUE_SITEMAP_SIZE) return [];
    const found = await query(`SELECT * FROM hotel_catalogue WHERE environment=$1 AND ${fresh} ORDER BY hotel_id LIMIT $3 OFFSET $4`,[environment,now().toISOString(),limit,shard*limit]);
    return found.rows.map(record);
  }
  async function stats(): Promise<HotelCatalogueStats> {
    const [totals,sync,discovered] = await Promise.all([
      query(`SELECT count(*)::text AS total,count(*) FILTER (WHERE ${fresh})::text AS ready,max(content_updated_at) AS updated FROM hotel_catalogue WHERE environment=$1`,[environment,now().toISOString()]),
      query('SELECT * FROM hotel_catalogue_sync WHERE environment=$1',[environment]),
      query(`SELECT count(*)::text AS total,count(*) FILTER (WHERE content_generation<seen_generation)::text AS missing FROM hotel_catalogue_discovery WHERE environment=$1`,[environment]),
    ]);
    const row = totals.rows[0], state = sync.rows[0];
    const indexable = environment === 'production' ? Number(row?.ready || 0) : 0;
    return {available:true,environment,total:Number(row?.total || 0),indexableTotal:indexable,productionIndexableTotal:indexable,
      ...(row?.updated ? {updatedAt:instant(row.updated)} : {}),countriesTotal:Array.isArray(state?.countries) ? state.countries.length : 0,
      countriesCompleted:Number(state?.country_index || 0),mappedHotels:Number(discovered.rows[0]?.total || 0),
      contentFetched:Number(state?.content_count || 0),missingContent:Number(discovered.rows[0]?.missing || 0),
      ...(state?.updated_at ? {lastSyncAt:instant(state.updated_at)} : {}),syncComplete:Boolean(state?.completed_at) && Number(discovered.rows[0]?.missing || 0) === 0};
  }
  async function upsert(content: HotelCatalogueContent) {
    if (content.environment !== environment || !catalogueHotelId(content.hotelId)) throw new Error('Catalogue identity mismatch.');
    const previous = await get(content.hotelId);
    // Explicit inactivity revokes a page even when that supplier tombstone contains no other fields.
    if (!content.active && previous) {
      content = {...previous,active:false};
      delete (content as Partial<HotelCatalogueRecord>).checkedAt;
      delete (content as Partial<HotelCatalogueRecord>).contentUpdatedAt;
    } else if (previous?.contentReady && !content.contentReady) {
      // A degraded/partial refresh cannot erase or re-date previously useful facts.
      return false;
    }
    const stored = {...content,slug:previous?.slug || content.slug};
    const hash = createHash('sha256').update(canonicalJson(stored)).digest('hex');
    await query(`INSERT INTO hotel_catalogue(environment,hotel_id,slug,name,city,country_name,address,content,content_hash,active,content_ready,content_updated_at,checked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$12)
      ON CONFLICT(environment,hotel_id) DO UPDATE SET name=excluded.name,city=excluded.city,country_name=excluded.country_name,address=excluded.address,
      content=excluded.content,content_hash=excluded.content_hash,active=excluded.active,content_ready=excluded.content_ready,
      content_updated_at=CASE WHEN hotel_catalogue.content_hash IS DISTINCT FROM excluded.content_hash THEN excluded.content_updated_at ELSE hotel_catalogue.content_updated_at END,
      checked_at=excluded.checked_at`,[environment,stored.hotelId,stored.slug,stored.name,stored.city,stored.countryName,stored.address,JSON.stringify(stored),hash,stored.active,stored.contentReady,now().toISOString()]);
    return true;
  }
  async function readSync(): Promise<HotelCatalogueSyncState | undefined> {
    const result = await query('SELECT * FROM hotel_catalogue_sync WHERE environment=$1',[environment]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {environment,countries:row.countries as string[],countryIndex:Number(row.country_index),mappingPage:Number(row.mapping_page),
      pendingIds:row.pending_ids as string[],contentOffset:Number(row.content_offset),mappingHasMore:row.mapping_has_more === true,pageLoaded:row.page_loaded === true,
      generation:Number(row.generation),mappedCount:Number(row.mapped_count),contentCount:Number(row.content_count),missingCount:Number(row.missing_count),
      ...(row.last_mapping_hash ? {lastMappingHash:String(row.last_mapping_hash)} : {}),
      ...(row.completed_at ? {completedAt:instant(row.completed_at)} : {})};
  }
  async function writeSync(state: HotelCatalogueSyncState) {
    if (state.environment !== environment) throw new Error('Catalogue checkpoint environment mismatch.');
    await query(`INSERT INTO hotel_catalogue_sync(environment,countries,country_index,mapping_page,pending_ids,content_offset,mapping_has_more,page_loaded,generation,mapped_count,content_count,missing_count,completed_at,last_mapping_hash)
      VALUES($1,$2::jsonb,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT(environment) DO UPDATE SET countries=excluded.countries,country_index=excluded.country_index,mapping_page=excluded.mapping_page,
      pending_ids=excluded.pending_ids,content_offset=excluded.content_offset,mapping_has_more=excluded.mapping_has_more,page_loaded=excluded.page_loaded,
      generation=excluded.generation,mapped_count=excluded.mapped_count,content_count=excluded.content_count,missing_count=excluded.missing_count,
      completed_at=excluded.completed_at,last_mapping_hash=excluded.last_mapping_hash,updated_at=now(),last_error_code=NULL,
      started_at=CASE WHEN hotel_catalogue_sync.generation<>excluded.generation THEN now() ELSE hotel_catalogue_sync.started_at END`,
      [environment,JSON.stringify(state.countries),state.countryIndex,state.mappingPage,JSON.stringify(state.pendingIds),state.contentOffset,state.mappingHasMore,state.pageLoaded,
        state.generation,state.mappedCount,state.contentCount,state.missingCount,state.completedAt || null,state.lastMappingHash || null]);
  }
  async function discover(ids: string[], country: string, generation: number) {
    if (ids.some(id => !catalogueHotelId(id))) throw new Error('Invalid discovered hotel ID.');
    if (!ids.length) return [];
    await query(`INSERT INTO hotel_catalogue_discovery(environment,hotel_id,country_name,seen_generation)
      SELECT $1,id,$3,$4 FROM unnest($2::text[]) AS id
      ON CONFLICT(environment,hotel_id) DO UPDATE SET seen_generation=excluded.seen_generation`,[environment,ids,country,generation]);
    const result = await query('SELECT hotel_id FROM hotel_catalogue_discovery WHERE environment=$1 AND hotel_id=ANY($2::text[]) AND content_generation<$3 ORDER BY hotel_id',[environment,ids,generation]);
    return result.rows.map(row => String(row.hotel_id));
  }
  async function markFetched(ids: string[], generation: number) {
    if (ids.length) await query('UPDATE hotel_catalogue_discovery SET content_generation=$3,content_attempts=0 WHERE environment=$1 AND hotel_id=ANY($2::text[])',[environment,ids,generation]);
  }
  async function markMissing(ids: string[]) {
    if (ids.length) await query(`UPDATE hotel_catalogue_discovery SET content_attempts=content_attempts+1,next_content_attempt=$3::timestamptz+interval '1 hour' WHERE environment=$1 AND hotel_id=ANY($2::text[])`,[environment,ids,now().toISOString()]);
  }
  async function pendingContent(generation: number, limit = 100): Promise<{country:string;hotelIds:string[]} | undefined> {
    const country = await query(`SELECT country_name FROM hotel_catalogue_discovery WHERE environment=$1 AND seen_generation=$2 AND content_generation<$2 AND next_content_attempt<=$3 ORDER BY next_content_attempt,hotel_id LIMIT 1`,[environment,generation,now().toISOString()]);
    if (!country.rows[0]) return undefined;
    const name = String(country.rows[0].country_name);
    const ids = await query(`SELECT hotel_id FROM hotel_catalogue_discovery WHERE environment=$1 AND seen_generation=$2 AND content_generation<$2 AND next_content_attempt<=$3 AND country_name=$4 ORDER BY hotel_id LIMIT $5`,[environment,generation,now().toISOString(),name,Math.min(100,Math.max(1,limit))]);
    return {country:name,hotelIds:ids.rows.map(row=>String(row.hotel_id))};
  }
  return {get,list,sitemap,stats,upsert,readSync,writeSync,discover,markFetched,markMissing,pendingContent};
}

import { database } from '../src/lib/db';
import { observedFlightPairs,observedRouteNotes,routeSlug,flightRouteContentReady,flightDiscoveryLimit } from '../src/lib/flight-route-catalogue';
import { UPSERT_FLIGHT_ROUTE_SQL } from '../src/lib/flight-route-store-sql';
import {searchSchema} from '../src/lib/providers/contracts';
import type {PoolClient} from 'pg';

// Decoupled from customer searches: bounded scan of existing results, never calls suppliers.
// Current flight provider is hardcoded UAT. A flag must never relabel this evidence as production.
let pool:ReturnType<typeof database>|undefined,client:PoolClient|undefined;
let searches=0,routes=0,locked=false,inTransaction=false;
const cleanupFailed=()=>{console.error('Flight route discovery connection cleanup failed. Check database connectivity before retrying.');process.exitCode=1;};
try {
  const limit=flightDiscoveryLimit(process.argv.slice(2));
  pool=database();pool.on('error',cleanupFailed);client=await pool.connect();
  const lock=await client.query('SELECT pg_try_advisory_lock(71266328) locked');locked=Boolean(lock.rows[0].locked);if(!locked)throw Error();
  await client.query('BEGIN');inTransaction=true;
  await client.query('INSERT INTO flight_route_discovery_checkpoint(singleton) VALUES(true) ON CONFLICT DO NOTHING');
  const found=await client.query<{id:string;created_at:Date;provider_environment:'uat'|'production'}>(`SELECT id,created_at,provider_environment FROM supplier_searches WHERE product='FLIGHT' AND created_at>=now()-interval '7 days' AND created_at<now()-interval '1 minute' AND (created_at,id)>(SELECT last_created_at,last_id FROM flight_route_discovery_checkpoint WHERE singleton=true) ORDER BY created_at,id LIMIT $1`,[limit]);
  for(const reference of found.rows) {
    // Keep at most one potentially large supplier response in memory at a time.
    const payload=await client.query<{criteria:unknown;results:unknown}>('SELECT criteria,results FROM supplier_searches WHERE id=$1',[reference.id]);
    const search={...reference,...payload.rows[0]};
    searches++;
    const criteria=searchSchema.safeParse(search.criteria);
    for(const pair of criteria.success&&criteria.data.product==='FLIGHT'?observedFlightPairs(search.results,criteria.data):[]) {
      const sourceUrl='https://www.tripjack.com/nav/api',notes=observedRouteNotes(pair.from,pair.to);
      const result=await client.query(UPSERT_FLIGHT_ROUTE_SQL,[pair.from,pair.to,routeSlug(pair.from,pair.to),sourceUrl,search.provider_environment,'observed',search.created_at,notes,true,flightRouteContentReady({...pair,sourceUrl,notes})]);routes+=result.rowCount??0;
    }
    await client.query('UPDATE flight_route_discovery_checkpoint SET last_created_at=$1,last_id=$2 WHERE singleton=true',[search.created_at,search.id]);
  }
  await client.query('COMMIT');inTransaction=false;console.log('Flight route discovery complete',{searches,routes,environmentSource:'persisted_at_supplier_search_creation',mayHaveMore:found.rows.length===limit});
} catch {
  if(client&&inTransaction)try{await client.query('ROLLBACK');}catch{/* A disconnected transaction rolls back on the server. */}
  console.error('Flight route discovery did not complete. Check arguments, database connectivity and catalogue schema before retrying.');process.exitCode=1;
} finally {
  if(client&&locked)try{await client.query('SELECT pg_advisory_unlock(71266328)');}catch{cleanupFailed();}
  try{client?.release();}catch{cleanupFailed();}
  try{await pool?.end();}catch{cleanupFailed();}
}

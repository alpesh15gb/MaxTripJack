import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { database } from '../src/lib/db';
import { parseRouteManifestRow,flightRouteContentReady } from '../src/lib/flight-route-catalogue';
import { UPSERT_FLIGHT_ROUTE_SQL } from '../src/lib/flight-route-store-sql';
import type {PoolClient} from 'pg';

// Explicit local JSONL manifest only. No remote fetching, airport permutations or credentials in output.
let pool:ReturnType<typeof database>|undefined,client:PoolClient|undefined;
let stream:ReturnType<typeof createReadStream>|undefined,rows:ReturnType<typeof createInterface>|undefined;
let seen=0,written=0,locked=false,inTransaction=false;
const cleanupFailed=()=>{console.error('Flight route import resource cleanup failed. Check file access and database connectivity before retrying.');process.exitCode=1;};
try {
  const input=process.argv.slice(2);const fileIndex=input.indexOf('--file');const file=fileIndex>=0?input[fileIndex+1]:undefined;
  if(!file||file.startsWith('--')||input.filter(arg=>arg==='--file').length!==1||input.filter(arg=>arg==='--apply').length>1||input.some((arg,i)=>arg!=='--file'&&i!==fileIndex+1&&arg!=='--apply'))throw Error();
  const apply=input.includes('--apply');
  if(apply){pool=database();pool.on('error',cleanupFailed);client=await pool.connect();const lock=await client.query('SELECT pg_try_advisory_lock(71266328) locked');locked=Boolean(lock.rows[0].locked);if(!locked)throw Error();}
  let batch=0;if(client){await client.query('BEGIN');inTransaction=true;}
  // Open after asynchronous database setup so the iterator observes stream errors.
  stream=createReadStream(file);rows=createInterface({input:stream,crlfDelay:Infinity});
  for await(const line of rows) {
    if(!line.trim())continue;
    if(line.length>16000)throw Error('Manifest record exceeds the size limit.');
    const route=parseRouteManifestRow(JSON.parse(line));seen++;
    if(client){const result=await client.query(UPSERT_FLIGHT_ROUTE_SQL,[route.from,route.to,route.slug,route.sourceUrl,route.environment,route.sourceKind,route.verifiedAt,route.notes,route.active,flightRouteContentReady(route)]);written+=result.rowCount??0;if(++batch===250){await client.query('COMMIT');inTransaction=false;console.log('Flight route batch saved',{validated:seen,written});await client.query('BEGIN');inTransaction=true;batch=0;}}
  }
  if(client){await client.query('COMMIT');inTransaction=false;}
  console.log('Flight route manifest checked',{validated:seen,written,applied:apply});
} catch(error) {
  if(client&&inTransaction)try{await client.query('ROLLBACK');}catch{/* A disconnected transaction rolls back on the server. */}
  console.error('Flight route import stopped; earlier completed batches are retained. No raw manifest data or credentials logged.',{record:seen+1,error:error instanceof SyntaxError?'invalid_json':'validation_or_storage_error'});process.exitCode=1;
} finally {
  try{rows?.close();stream?.destroy();}catch{cleanupFailed();}
  if(client&&locked)try{await client.query('SELECT pg_advisory_unlock(71266328)');}catch{cleanupFailed();}
  try{client?.release();}catch{cleanupFailed();}
  try{await pool?.end();}catch{cleanupFailed();}
}

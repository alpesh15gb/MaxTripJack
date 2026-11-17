/** Isolated development/test preload, never imported by production code.
 * Runs actual SSR SQL against in-memory PGlite and prevents outbound fetches.
 * There is no HTTP header, environment flag or URL that enables fixtures in production.
 */
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {normaliseCatalogueHotel} from '../src/lib/hotel-catalogue';
import {createHotelCatalogueRepository} from '../src/lib/hotel-catalogue-repository';
import {parseRouteManifestRow, routeSlug, flightRouteContentReady} from '../src/lib/flight-route-catalogue';
import {UPSERT_FLIGHT_ROUTE_SQL} from '../src/lib/flight-route-store-sql';

Object.assign(process.env,{
  DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/catalogue_test',
  SEO_INDEXING_ENABLED:'true',SEO_SITE_ORIGIN:'https://maxtravel.in',
  HOTEL_CATALOGUE_ENVIRONMENT:'production',HOTEL_CATALOGUE_PRODUCTION_APPROVED:'true',
  MAX_AI_ENABLED:'true',MAX_AI_BASE_URL:'http://127.0.0.1:1/v1',MAX_AI_API_KEY:'isolated-ui-fixture-only',
  MAX_AI_CONVERSATION_SECRET:'isolated-ui-fixture-secret-never-used-for-real-accounts',
  BETTER_AUTH_URL:'http://127.0.0.1:3112',BETTER_AUTH_SECRET:'isolated-ui-fixture-auth-secret-never-used-for-real-accounts',
  TRIPJACK_FLIGHT_API_KEY:'',TRIPJACK_HOTEL_API_KEY:'',
  CRM_EVENTS_URL:'',SAFAR_ENQUIRY_URL:'',SMTP_HOST:'',MAIL_FROM:'',
});
const db=new PGlite();
await db.exec('CREATE TABLE supplier_searches(id uuid PRIMARY KEY,created_at timestamptz DEFAULT now(),product text,criteria jsonb,results jsonb);');
for(const name of ['026-hotel-catalogue','027-flight-route-catalogue','028-hotel-catalogue-priority','029-hotel-catalogue-search'])await db.exec(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
const query=async(sql:string,values?:unknown[])=>{
  const result=await db.query(sql,values);
  return {rows:result.rows as Record<string,unknown>[],rowCount:result.affectedRows??result.rows.length,command:'SELECT',fields:[]};
};
const repository=createHotelCatalogueRepository(query,'production');
for(let index=1;index<=26;index++) {
  // Explicitly synthetic search scenarios; these do not identify real inventory.
  const name=index===2?'Seasons Example Hotel':index===3?'Hotel Mira Mare':`Catalogue Test Hotel ${String(index).padStart(2,'0')}`;
  const city=index===2?'Mumbai':index===3?'Ksamil':'Hyderabad';
  const country=index===3?'ALBANIA':'INDIA';
  const address=index===2?'Synthetic Test Lane, Mira Road, Mumbai, India':index===3?'Road Kol Jakova, Ksamil, Albania':'Synthetic Test Road, Hyderabad, Telangana, India';
  // Public supplier images already displayed on MaxTravel, used only for gallery UI checks.
  const photos=index===1?['b5295d0b_z.jpg','fd6948e1_z.jpg','47de16b8_z.jpg'].map((file,i)=>({is_hero_image:i===0,links:{Standard:{href:`https://i.travelapi.com/lodging/43000000/42560000/42559900/42559900/${file}`}}})):[];
  const hotel=normaliseCatalogueHotel({
    tjHotelId:String(900000000+index),name,is_active:true,star_rating:3,
    locale:{address:{city,countrycode:index===3?'AL':'IN',fulladdr:address}},
    descriptions:{default:JSON.stringify({Overview:'Synthetic property content for isolated website testing. This fixture represents no actual hotel and cannot be booked. The page checks clear location details, accessible content and a straightforward path to requesting availability.'})},
    amenities:{a:{name:'Wi-Fi'},b:{name:'Reception'},c:{name:'Lift'},d:{name:'Parking'}},images:photos,
  },country,'production');
  if(!hotel)throw Error('Fixture hotel identity invalid');
  await repository.upsert(hotel);
}
const inactive=await repository.get('900000001');
if(!inactive)throw Error('Fixture setup failed');
await repository.upsert({...inactive,hotelId:'900000099',slug:'inactive-test-hotel-900000099',name:'Inactive Test Hotel',active:false});
await repository.upsert({...inactive,hotelId:'900000098',slug:'incomplete-test-hotel-900000098',name:'Incomplete Test Hotel',description:undefined,amenities:[],contentReady:false});
const route=parseRouteManifestRow({from:'LKO',to:'BLR',sourceUrl:'https://www.tripjack.com/nav/api',verifiedAt:new Date().toISOString(),environment:'production',notes:'Synthetic route fixture for isolated server rendering tests. Compare airport identities and choose your own travel dates before requesting current availability.'});
await query(UPSERT_FLIGHT_ROUTE_SQL,[route.from,route.to,route.slug,route.sourceUrl,route.environment,route.sourceKind,route.verifiedAt,route.notes,true,flightRouteContentReady(route)]);

class FixturePool {
  query=query;
  async connect(){return {query,release(){}};}
  async end(){}
  on(){return this;}
}
pg.Pool=FixturePool as unknown as typeof pg.Pool;
// Turbopack may bundle its own pg import; use the application's existing pool
// singleton in this isolated process, without adding a production fixture hook.
(globalThis as unknown as {travelPool:unknown}).travelPool=new FixturePool();
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(!['127.0.0.1','localhost'].includes(target.hostname))throw Error('Outbound fetch blocked by isolated catalogue test server');
  return originalFetch(input,init);
};
console.log('Isolated catalogue SSR fixtures ready',{hotels:26,flightRoute:routeSlug('LKO','BLR'),externalFetches:'blocked'});

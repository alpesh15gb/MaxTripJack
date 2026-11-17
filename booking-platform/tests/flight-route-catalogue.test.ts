import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import airports from '../src/data/airports.json';
import {flightGuides} from '../src/lib/flight-guides';
import {routeSlug,routePairFromSlug,parseRouteManifestRow,flightRouteIndexEligible,flightRouteContentReady,flightRoutePath,observedFlightPairs,observedRouteNotes,routeAirport,flightDiscoveryLimit} from '../src/lib/flight-route-catalogue';
import {flightRouteStructuredData,flightRouteSearchHref} from '../src/lib/flight-route-seo';
import {isFlightRouteSeoPath} from '../src/lib/flight-route-paths';
import {UPSERT_FLIGHT_ROUTE_SQL,INDEXABLE_FLIGHT_ROUTE_WHERE} from '../src/lib/flight-route-store-sql';
import {flightSitemapIndex,flightSitemapXml} from '../src/lib/flight-route-sitemap';
const now=Date.parse('2026-11-17T08:00:00Z');
const manifest={from:'LKO',to:'BLR',sourceUrl:'https://www.tripjack.com/nav/api',verifiedAt:'2026-11-17T07:00:00Z',environment:'production',notes:'Use the exact Lucknow and Bengaluru airport codes when arranging transfers. Check the selected itinerary for terminals, baggage and connection details.'};
const segment=(from:string,to:string,date='2026-12-01')=>({da:{code:from},aa:{code:to},dt:`${date}T11:00`});

test('route identities are canonical known airport pairs, with no manufactured same-airport pages',()=>{
  const route=parseRouteManifestRow(manifest,now);
  assert.deepEqual(routePairFromSlug(route.slug),{from:'LKO',to:'BLR'});
  assert.match(route.slug,/^lucknow-lko-to-.*-blr$/);
  assert.throws(()=>routeSlug('LKO','LKO'));
  assert.throws(()=>routeSlug('ZZZ','HYD'));
  for(const slug of ['lucknow-to-hyderabad','x-lko-to-y-zzz','x-lko-to-y-lko','../x-lko-to-y-hyd','x-LKO-to-y-HYD'])assert.equal(routePairFromSlug(slug),null);
  assert.equal(flightRoutePath({...route,from:'LKO',to:'HYD',slug:routeSlug('LKO','HYD')}),'/flights/lucknow-to-hyderabad');
  assert.ok(flightGuides.find(g=>g.slug==='lucknow-to-hyderabad'));
});

test('provenance, environment and freshness gate search indexing',()=>{
  const route=parseRouteManifestRow(manifest,now);
  assert.equal(flightRouteIndexEligible(route,now),true);
  assert.equal(flightRouteIndexEligible({...route,environment:'uat'},now),false);
  assert.equal(flightRouteIndexEligible({...route,active:false},now),false);
  assert.equal(flightRouteIndexEligible({...route,verifiedAt:'2025-01-01T00:00:00Z'},now),false);
  assert.equal(flightRouteIndexEligible({...route,notes:''},now),false);
  for(const sourceUrl of ['http://example.org','https://user:pass@example.org','https://127.0.0.1/','https://server.local/','https://server.internal/','https://example.org/?key=secret','javascript:alert(1)'])assert.throws(()=>parseRouteManifestRow({...manifest,sourceUrl},now));
  assert.throws(()=>parseRouteManifestRow({...manifest,notes:'<script>alert(1)</script>'},now));
  assert.throws(()=>parseRouteManifestRow({...manifest,verifiedAt:'2027-01-01T00:00:00Z'},now));
});

test('discovery CLI rejects unknown, duplicate and unbounded arguments',()=>{
  assert.equal(flightDiscoveryLimit([]),500);assert.equal(flightDiscoveryLimit(['--limit','1']),1);assert.equal(flightDiscoveryLimit(['--limit','1000']),1000);
  for(const args of [['--limit=10'],['garbage'],['--limit'],['--limit','0'],['--limit','1001'],['--limit','1e2'],['--limit','10','--limit','20']])assert.throws(()=>flightDiscoveryLimit(args));
});

test('API capture retains only actual result endpoints; no fares, customers or airport permutations',()=>{
  const response={searchResult:{tripInfos:{ONWARD:[{sI:[segment('LKO','DEL'),segment('DEL','HYD')],totalPriceList:[{id:'secret-price',price:100}],email:'private@example.test'}]}}};
  assert.deepEqual(observedFlightPairs(response,{from:'LKO',to:'HYD',date:'2026-12-01'}),[{from:'LKO',to:'HYD'}]);
  assert.deepEqual(observedFlightPairs(response,{from:'LKO',to:'BLR',date:'2026-12-01'}),[]);
  assert.deepEqual(observedFlightPairs({searchResult:{tripInfos:{ONWARD:[]}}}),[]);
  assert.deepEqual(observedFlightPairs({}),[]);
  const serialized=JSON.stringify(observedFlightPairs(response));assert.doesNotMatch(serialized,/private|price|DEL/);
  assert.ok(observedRouteNotes('LKO','HYD').length>=80);
  assert.doesNotMatch(observedRouteNotes('LKO','HYD'),/non-stop|guaranteed|₹/);
});

test('API capture handles complete round trips and multi-city combinations without inventing missing legs',()=>{
  const combo={searchResult:{tripInfos:{COMBO:[{sI:[segment('LKO','DEL'),segment('DEL','HYD'),segment('HYD','LKO','2026-12-05')]}]}}};
  assert.deepEqual(observedFlightPairs(combo,{from:'LKO',to:'HYD',date:'2026-12-01',returnDate:'2026-12-05'}),[{from:'LKO',to:'HYD'},{from:'HYD',to:'LKO'}]);
  const legs=[{from:'LKO',to:'HYD',date:'2026-12-01'},{from:'HYD',to:'BLR',date:'2026-12-05'}];
  const multi={searchResult:{tripInfos:{COMBO:[{sI:[segment('LKO','HYD'),segment('HYD','BLR','2026-12-05')]}]}}};
  assert.deepEqual(observedFlightPairs(multi,{...legs[0],legs}),[{from:'LKO',to:'HYD'},{from:'HYD',to:'BLR'}]);
  assert.deepEqual(observedFlightPairs({searchResult:{tripInfos:{ONWARD:[{sI:[segment('LKO','HYD')]}]}}},{...legs[0],returnDate:'2026-12-05'}),[]);
});

test('metadata payload is descriptive and CTA selects no date, fare or reservation',()=>{
  const route=parseRouteManifestRow(manifest,now),graph=flightRouteStructuredData(route),href=new URL(flightRouteSearchHref(route),'https://maxtravel.in');
  assert.equal(href.searchParams.get('from'),'LKO');assert.equal(href.searchParams.get('to'),'BLR');
  assert.deepEqual([...href.searchParams.keys()].sort(),['from','product','to']);
  assert.doesNotMatch(JSON.stringify(graph),/"(?:offers|price|aggregateRating|flightNumber|departureTime)"/);
  assert.match(JSON.stringify(graph),/"Airport"/);
  assert.ok(isFlightRouteSeoPath(`/flights/${route.slug}`));
  assert.ok(isFlightRouteSeoPath('/flights/routes/page/2'));
  for(const path of ['/book','/flights/routes?page=2','/flights/routes/page/0','/flights/not-a-route','/flights/routes/page/9999999'])assert.equal(isFlightRouteSeoPath(path),false);
});

test('sitemaps are bounded index/shard documents and never advertise query pages',()=>{
  const route=parseRouteManifestRow(manifest,now);
  assert.match(flightSitemapIndex(2),/flight-route-sitemap-1\.xml/);
  assert.doesNotMatch(flightSitemapIndex(2),/<url>/);
  const xml=flightSitemapXml([route]);assert.match(xml,/<urlset/);assert.match(xml,/<lastmod>2026-11-17T07:00:00Z<\/lastmod>/);assert.doesNotMatch(xml,/<loc>[^<]*\?|supplier_search/);
  assert.throws(()=>flightSitemapXml(Array(10001).fill(route)));assert.throws(()=>flightSitemapIndex(-1));
});

test('storage preserves canonical slugs and production provenance against later UAT observations',async()=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE TABLE supplier_searches(id uuid,product text,created_at timestamptz);');
    await db.exec(readFileSync(new URL('../db/027-flight-route-catalogue.sql',import.meta.url),'utf8'));
    const route=parseRouteManifestRow(manifest,now);
    const save=async(overrides:Partial<typeof route>={})=>{const r={...route,...overrides};await db.query(UPSERT_FLIGHT_ROUTE_SQL,[r.from,r.to,r.slug,r.sourceUrl,r.environment,r.sourceKind,r.verifiedAt,r.notes,r.active,flightRouteContentReady(r)]);};
    await save();await save({slug:'changed-name-lko-to-bangalore-blr',verifiedAt:'2026-11-18T00:00:00Z',notes:manifest.notes+' Updated.'});
    await save({environment:'uat',sourceKind:'observed',verifiedAt:'2026-11-19T00:00:00Z',notes:observedRouteNotes('LKO','BLR')});
    const row=(await db.query<{canonical_slug:string;source_environment:string;source_kind:string;notes:string}>('SELECT * FROM flight_route_catalogue')).rows[0];
    assert.equal(row.canonical_slug,route.slug);assert.equal(row.source_environment,'production');assert.equal(row.source_kind,'manifest');assert.match(row.notes,/Updated\.$/);
    await save({verifiedAt:'2026-11-20T00:00:00Z',active:false});assert.equal((await db.query<{active:boolean}>('SELECT active FROM flight_route_catalogue')).rows[0].active,false);
    await db.query("INSERT INTO supplier_searches(id,product,created_at) VALUES('00000000-0000-0000-0000-000000000001','FLIGHT',now())");
    assert.equal((await db.query<{provider_environment:string}>('SELECT provider_environment FROM supplier_searches')).rows[0].provider_environment,'uat');
  } finally {await db.close();}
});

test('SQL directory and sitemap totals use the same content quality gate as page metadata',async()=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE TABLE supplier_searches(id uuid,product text,created_at timestamptz);');
    await db.exec(readFileSync(new URL('../db/027-flight-route-catalogue.sql',import.meta.url),'utf8'));
    const missingZone=airports.find(airport=>routeAirport(airport.code)&&!routeAirport(airport.code)?.timezone);
    assert.ok(missingZone,'The catalogue includes airports without verified timezone data.');
    const verifiedAt=new Date().toISOString();
    const records=[parseRouteManifestRow({...manifest,verifiedAt}),parseRouteManifestRow({...manifest,to:missingZone.code,verifiedAt})];
    for(const r of records)await db.query(UPSERT_FLIGHT_ROUTE_SQL,[r.from,r.to,r.slug,r.sourceUrl,r.environment,r.sourceKind,r.verifiedAt,r.notes,r.active,flightRouteContentReady(r)]);
    const count=(await db.query<{count:number}>(`SELECT count(*)::int count FROM flight_route_catalogue WHERE ${INDEXABLE_FLIGHT_ROUTE_WHERE}`)).rows[0].count;
    assert.equal(count,1);assert.equal(count,records.filter(route=>flightRouteIndexEligible(route)).length);
  } finally {await db.close();}
});

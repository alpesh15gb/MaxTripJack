import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {catalogueEnvironment,catalogueHotelId,catalogueHotelSlug,normaliseCatalogueHotel,isCatalogueHotelIndexable} from '../src/lib/hotel-catalogue';
import {createHotelCatalogueRepository} from '../src/lib/hotel-catalogue-repository';
import {catalogueCountries,catalogueMapping,syncHotelCatalogue,type HotelCatalogueClient} from '../src/lib/hotel-catalogue-sync';
import {createHotelCatalogueClient,HotelCatalogueSupplierError} from '../src/lib/hotel-catalogue-client';

const supplierHotel=(id='123')=>({tjHotelId:id,name:'Seasons Example Hotel',is_active:true,star_rating:'4',locale:{address:{city:'Mira Road',countrycode:'IN',fulladdr:'Example Road, Mira Road, Maharashtra, India'}},
  descriptions:{default:JSON.stringify({Overview:'A supplier-provided description of this example hotel, its rooms and location. This sample is used only in isolated tests and makes no live availability promise.'})},
  amenities:{one:{name:'Wifi'},two:{name:'Parking'},three:{name:'Restaurant'},four:{name:'Reception'}},
  images:[{is_hero_image:true,caption:'Guest room',links:{Standard:{href:'https://pix8.agoda.net/hotelImages/123/room.jpg'}}}],
  pricing:{totalPrice:1},cancellation:{isRefundable:true},guestRating:10,internalContact:'not public'});
async function isolatedDatabase(){
  const db=new PGlite();
  await db.exec(await readFile(new URL('../db/026-hotel-catalogue.sql',import.meta.url),'utf8'));
  return db;
}

test('catalogue normalisation keeps only bounded supplier facts, meaningful content and safe identities',()=>{
  const normal=normaliseCatalogueHotel(supplierHotel(),'India','production')!;
  assert.equal(normal.contentReady,true);assert.equal(normal.city,'Mira Road');assert.equal(normal.countryCode,'IN');assert.equal(normal.starRating,4);
  for(const forbidden of ['pricing','cancellation','guestRating','internalContact'])assert.ok(!JSON.stringify(normal).includes(forbidden));
  const altered=normaliseCatalogueHotel({...supplierHotel(),name:'<script>bad()</script><b>Seasons &amp; Stay</b>',images:[{links:{Standard:{href:'http://127.0.0.1/private'}}}]},'India','uat')!;
  assert.equal(altered.name,'Seasons & Stay');assert.deepEqual(altered.photos,[]);
  const thin=normaliseCatalogueHotel({tjHotelId:'124',name:'Only a name',locale:{address:{city:'Mumbai',fulladdr:'Some street address'}},images:supplierHotel().images},'India','production')!;
  assert.equal(thin.contentReady,false);
  assert.equal(normaliseCatalogueHotel({...supplierHotel(),is_active:false},'India','uat')?.active,false);
  for(const invalid of ['001','0','-1','1e3',9007199254740992,'123/secret',null])assert.equal(catalogueHotelId(invalid),undefined);
  assert.equal(catalogueHotelSlug('Hôtel Example','Mira Road','123'),'hotel-example-mira-road-123');
});

test('indexability requires production approval, useful active content and recent refresh',()=>{
  assert.equal(catalogueEnvironment({}),'uat');
  assert.throws(()=>catalogueEnvironment({HOTEL_CATALOGUE_ENVIRONMENT:'production'}));
  assert.throws(()=>catalogueEnvironment({HOTEL_CATALOGUE_ENVIRONMENT:'other'}));
  assert.equal(catalogueEnvironment({HOTEL_CATALOGUE_ENVIRONMENT:'production',HOTEL_CATALOGUE_PRODUCTION_APPROVED:'true'}),'production');
  const now=Date.parse('2026-11-17T00:00:00Z');
  const hotel={...normaliseCatalogueHotel(supplierHotel(),'India','production')!,checkedAt:'2026-11-16T00:00:00Z',contentUpdatedAt:'2026-11-01T00:00:00Z'};
  assert.equal(isCatalogueHotelIndexable(hotel,now),true);
  for(const changes of [{environment:'uat' as const},{active:false},{contentReady:false},{checkedAt:'2026-01-01'},{checkedAt:'2027-01-01'},{checkedAt:'bad'}])assert.equal(isCatalogueHotelIndexable({...hotel,...changes},now),false);
});

test('country and full mapping pagination preserve coverage and reject ambiguous identities',()=>{
  assert.deepEqual(catalogueCountries({hotelCountries:['India','United States','India']}),['India','United States']);
  for(const value of [{hotelCountries:[]},{hotelCountries:[{}]},{hotelCountries:['<b>India</b>']},{}])assert.throws(()=>catalogueCountries(value));
  const full=Array.from({length:2000},(_,index)=>({tjHotelId:String(index+1)}));
  assert.equal(catalogueMapping({hotels:full},0).hasMore,true);
  assert.equal(catalogueMapping({hotels:[],pageable:{totalPages:3}},0).hasMore,true);
  assert.deepEqual(catalogueMapping({hotels:[{tjHotelId:1},{tjHotelId:'1'}],pageable:{totalPages:'1'}},0),{hotelIds:['1'],hasMore:false});
  for(const value of [{hotels:[{tjHotelId:'001'}]},{hotels:full.concat({tjHotelId:'2001'})},{hotels:[{tjHotelId:'1'}],pageable:{totalPages:0}},{hotels:[],pageable:{totalPages:'bad'}}])assert.throws(()=>catalogueMapping(value,0));
});

test('PostgreSQL catalogue persistence freezes URLs, preserves actual modification dates and isolates UAT',async()=>{
  const db=await isolatedDatabase();let time=new Date('2026-11-17T00:00:00Z');
  const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'production',()=>time);
  const uat=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat',()=>time);
  try{
    const content=normaliseCatalogueHotel(supplierHotel(),'India','production')!;
    await repo.upsert(content);const original=(await repo.get('123'))!;
    time=new Date('2026-11-18T00:00:00Z');await repo.upsert(content);
    assert.equal((await repo.get('123'))?.contentUpdatedAt,original.contentUpdatedAt);
    assert.notEqual((await repo.get('123'))?.checkedAt,original.checkedAt);
    time=new Date('2026-11-19T00:00:00Z');await repo.upsert({...content,name:'Renamed Hotel',slug:'renamed-123'});
    const renamed=(await repo.get('123'))!;assert.equal(renamed.slug,original.slug);assert.equal(renamed.name,'Renamed Hotel');assert.notEqual(renamed.contentUpdatedAt,original.contentUpdatedAt);
    await repo.upsert(normaliseCatalogueHotel({tjHotelId:'123',name:'Partial'},'India','production')!);
    assert.equal((await repo.get('123'))?.name,'Renamed Hotel');assert.equal((await repo.get('123'))?.checkedAt,renamed.checkedAt);
    await uat.upsert(normaliseCatalogueHotel({...supplierHotel(),name:'UAT stay'},'India','uat')!);
    assert.equal((await repo.get('123'))?.name,'Renamed Hotel');assert.equal((await uat.get('123'))?.name,'UAT stay');assert.deepEqual(await uat.sitemap(0),[]);
    assert.equal((await repo.list({query:'Mira Road'})).total,1);
    assert.equal((await repo.list({query:"'; DROP TABLE hotel_catalogue;--"})).total,0);
    assert.equal((await repo.sitemap(0)).length,1);assert.equal((await repo.sitemap(1)).length,0);
    await repo.upsert(normaliseCatalogueHotel({tjHotelId:'123',is_active:false},'India','production')!);
    assert.equal((await repo.get('123'))?.active,false);assert.equal((await repo.get('123'))?.name,'Renamed Hotel');assert.equal((await repo.list()).total,0);assert.equal((await repo.sitemap(0)).length,0);
    const inactiveTime=(await repo.get('123'))!.contentUpdatedAt;time=new Date('2026-11-20T00:00:00Z');await repo.upsert(normaliseCatalogueHotel({tjHotelId:'123',is_active:false},'India','production')!);
    assert.equal((await repo.get('123'))?.contentUpdatedAt,inactiveTime);
  }finally{await db.close();}
});

test('catalogue lists and sitemap exclude stale and incomplete records, with real shard pagination',async()=>{
  const db=await isolatedDatabase();let time=new Date('2026-01-01T00:00:00Z');
  const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'production',()=>time);
  try{
    await repo.upsert(normaliseCatalogueHotel(supplierHotel('1'),'India','production')!);
    time=new Date('2026-11-17T00:00:00Z');
    for(const id of ['2','3','4'])await repo.upsert(normaliseCatalogueHotel(supplierHotel(id),'India','production')!);
    await repo.upsert(normaliseCatalogueHotel({tjHotelId:'5',name:'Incomplete'},'India','production')!);
    assert.equal((await repo.stats()).total,5);assert.equal((await repo.stats()).indexableTotal,3);
    assert.deepEqual((await repo.sitemap(0,2)).map(row=>row.hotelId),['2','3']);assert.deepEqual((await repo.sitemap(1,2)).map(row=>row.hotelId),['4']);
    assert.equal((await repo.list({page:2,pageSize:2})).hotels.length,1);assert.equal((await repo.list()).total,3);
  }finally{await db.close();}
});

test('country importer resumes the exact content batch after failure and traverses all mapping pages',async()=>{
  const db=await isolatedDatabase();const now=()=>new Date('2026-11-17T00:00:00Z');
  const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat',now);
  const atomic=async<T>(work:()=>Promise<T>)=>{await db.exec('BEGIN');try{const result=await work();await db.exec('COMMIT');return result;}catch(error){await db.exec('ROLLBACK');throw error;}};
  let fail=true,countryCalls=0;const mappingCalls:string[]=[];const contentCalls:string[][]=[];
  const client:HotelCatalogueClient={countries:async()=>{countryCalls++;return{hotelCountries:['India','France']};},mapping:async(country,page)=>{mappingCalls.push(`${country}:${page}`);return country==='France'?{hotels:[],pageable:{totalPages:0}}:page===0?{hotels:Array.from({length:101},(_,i)=>({tjHotelId:String(i+1)})),pageable:{totalPages:2}}:{hotels:[{tjHotelId:'1'},{tjHotelId:'102'}],pageable:{totalPages:2}};},content:async ids=>{contentCalls.push(ids);if(fail&&ids.includes('99'))throw Error('Synthetic interruption');return{hotels:ids.map(id=>supplierHotel(id))};}};
  try{
    await assert.rejects(()=>syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,now,maxPages:1}));
    const interrupted=await repo.readSync();assert.equal(interrupted?.mappingPage,0);assert.equal(interrupted?.pageLoaded,true);assert.equal(interrupted?.contentOffset,100);
    fail=false;const first=await syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,now,maxPages:1});
    assert.equal(first.mappingComplete,false);assert.equal(first.pages,1);assert.equal(countryCalls,1);assert.deepEqual(mappingCalls,['India:0']);
    await syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,now,maxPages:2});
    assert.deepEqual(mappingCalls,['India:0','India:1','France:0']);assert.deepEqual(contentCalls.at(-1),['102']);
    const stats=await repo.stats();assert.equal(stats.total,102);assert.equal(stats.mappedHotels,102);assert.equal(stats.missingContent,0);assert.equal(stats.syncComplete,true);
    assert.equal(stats.indexableTotal,0);assert.equal(stats.countriesCompleted,2);
    const calls=contentCalls.length;await syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,now,maxPages:2});assert.equal(contentCalls.length,calls);
  }finally{await db.close();}
});

test('missing content is retained for delayed retry and never erases an existing property',async()=>{
  const db=await isolatedDatabase();let time=new Date('2026-11-17T00:00:00Z');const now=()=>time;
  const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'production',now);
  const atomic=async<T>(work:()=>Promise<T>)=>{await db.exec('BEGIN');try{const value=await work();await db.exec('COMMIT');return value;}catch(error){await db.exec('ROLLBACK');throw error;}};
  let supplied=false;
  const client:HotelCatalogueClient={countries:async()=>({hotelCountries:['India']}),mapping:async()=>({hotels:[{tjHotelId:'1'},{tjHotelId:'2'}],pageable:{totalPages:1}}),content:async ids=>({hotels:ids.filter(id=>id==='1'||supplied).map(id=>supplierHotel(id))})};
  try{
    await repo.upsert(normaliseCatalogueHotel(supplierHotel('2'),'India','production')!);const previous=(await repo.get('2'))!;
    const first=await syncHotelCatalogue({repository:repo,client,environment:'production',atomic,now,maxPages:1});
    assert.equal(first.mappingComplete,true);assert.equal(first.stats.syncComplete,false);assert.equal(first.stats.missingContent,1);assert.equal(first.stats.mappedHotels,2);
    assert.equal((await repo.get('2'))?.contentUpdatedAt,previous.contentUpdatedAt);
    assert.equal(await repo.pendingContent(1),undefined);
    time=new Date('2026-11-17T01:01:00Z');supplied=true;
    const retried=await syncHotelCatalogue({repository:repo,client,environment:'production',atomic,now,maxPages:1});assert.equal(retried.retryBatches,1);assert.equal(retried.stats.missingContent,0);assert.equal(retried.stats.syncComplete,true);
    const refreshed=await syncHotelCatalogue({repository:repo,client,environment:'production',atomic,now,maxPages:1,refresh:true});assert.equal(refreshed.generation,2);
  }finally{await db.close();}
});

test('unexpected supplier identities and failed transactions cannot advance an import checkpoint',async()=>{
  const db=await isolatedDatabase();const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat');
  const atomic=async<T>(work:()=>Promise<T>)=>{await db.exec('BEGIN');try{const value=await work();await db.exec('COMMIT');return value;}catch(error){await db.exec('ROLLBACK');throw error;}};
  const client:HotelCatalogueClient={countries:async()=>({hotelCountries:['India']}),mapping:async()=>({hotels:[{tjHotelId:'1'}],pageable:{totalPages:1}}),content:async()=>({hotels:[supplierHotel('999')]})};
  try{
    await assert.rejects(()=>syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,maxPages:1}));
    assert.equal((await repo.readSync())?.contentOffset,0);assert.equal((await repo.stats()).total,0);assert.equal((await repo.stats()).mappedHotels,1);
    await assert.rejects(()=>syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,maxPages:1,refresh:true}));
  }finally{await db.close();}
});

test('content upserts and checkpoint are atomic if a database operation fails halfway through a batch',async()=>{
  const db=await isolatedDatabase();const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat');
  const atomic=async<T>(work:()=>Promise<T>)=>{await db.exec('BEGIN');try{const value=await work();await db.exec('COMMIT');return value;}catch(error){await db.exec('ROLLBACK');throw error;}};
  const failing={...repo,upsert:async(content:Parameters<typeof repo.upsert>[0])=>{if(content.hotelId==='2')throw Error('Synthetic transaction failure');return repo.upsert(content);}};
  const client:HotelCatalogueClient={countries:async()=>({hotelCountries:['India']}),mapping:async()=>({hotels:[{tjHotelId:'1'},{tjHotelId:'2'}],pageable:{totalPages:1}}),content:async ids=>({hotels:ids.map(id=>supplierHotel(id))})};
  try{
    await assert.rejects(()=>syncHotelCatalogue({repository:failing,client,environment:'uat',atomic,maxPages:1}));
    assert.equal((await repo.stats()).total,0);assert.equal((await repo.readSync())?.contentOffset,0);
    const resumed=await syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,maxPages:1});assert.equal(resumed.stats.total,2);assert.equal(resumed.stats.syncComplete,true);
  }finally{await db.close();}
});

test('a repeated supplier mapping page pauses at its checkpoint rather than looping or claiming full coverage',async()=>{
  const db=await isolatedDatabase();const repo=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat');
  const atomic=async<T>(work:()=>Promise<T>)=>{await db.exec('BEGIN');try{const value=await work();await db.exec('COMMIT');return value;}catch(error){await db.exec('ROLLBACK');throw error;}};
  const client:HotelCatalogueClient={countries:async()=>({hotelCountries:['India']}),mapping:async()=>({hotels:[{tjHotelId:'1'}],pageable:{totalPages:3}}),content:async ids=>({hotels:ids.map(id=>supplierHotel(id))})};
  try{
    await assert.rejects(()=>syncHotelCatalogue({repository:repo,client,environment:'uat',atomic,maxPages:2}),/repeated/);
    assert.equal((await repo.readSync())?.mappingPage,1);assert.equal((await repo.stats()).total,1);assert.equal((await repo.stats()).syncComplete,false);
  }finally{await db.close();}
});

test('supplier client fixes host and endpoint, bounds retries and never exposes API keys',async()=>{
  const seen:{url:string;init:RequestInit|undefined}[]=[];const waits:number[]=[];let calls=0;
  const client=createHotelCatalogueClient({env:{TRIPJACK_HOTEL_API_KEY:'synthetic-secret'},wait:async ms=>{waits.push(ms);},fetcher:async(url,init)=>{seen.push({url:String(url),init});calls++;return calls<3?new Response('',{status:503}):Response.json({status:{success:true},hotelCountries:['India']});}});
  await client.countries();assert.equal(calls,3);assert.ok(waits.includes(1000)&&waits.includes(2000));assert.equal(seen[0].url,'https://apitest-hms.tripjack.com/hms/v3/content/fetch-countries');assert.equal(seen[0].init?.redirect,'error');
  let body='';let productionUrl='';
  const production=createHotelCatalogueClient({env:{HOTEL_CATALOGUE_ENVIRONMENT:'production',HOTEL_CATALOGUE_PRODUCTION_APPROVED:'true',TRIPJACK_HOTEL_API_KEY:'synthetic-secret'},wait:async()=>{},fetcher:async(url,init)=>{productionUrl=String(url);body=String(init?.body);return Response.json({status:{success:true},hotels:[]});}});
  await production.mapping('India',3);assert.equal(productionUrl,'https://hms-search.tripjack.com/hms/v3/content/fetch-hotel-mapping');assert.deepEqual(JSON.parse(body),{countryName:'India',page:3,size:2000});
  await production.content(['1']);assert.deepEqual(JSON.parse(body),{hotelIds:['1'],isAllImagesRequired:true});
  assert.throws(()=>production.content(Array.from({length:101},(_,i)=>String(i+1))));
  assert.throws(()=>createHotelCatalogueClient({env:{HOTEL_CATALOGUE_ENVIRONMENT:'production',TRIPJACK_HOTEL_API_KEY:'synthetic-secret'}}));
});

test('supplier client rejects oversized and malformed bodies without raw error details',async()=>{
  for(const response of [new Response('{}',{headers:{'content-length':String(17*1024*1024)}}),Response.json({status:{success:false},secret:'private'}),new Response('not json'),new Response('',{status:401})]){
    const client=createHotelCatalogueClient({env:{TRIPJACK_HOTEL_API_KEY:'private-api-key'},wait:async()=>{},fetcher:async()=>response});
    await assert.rejects(()=>client.countries(),error=>error instanceof HotelCatalogueSupplierError&&!error.message.includes('private'));
  }
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(17*1024*1024));},cancel(){cancelled=true;}});
  const streamed=createHotelCatalogueClient({env:{TRIPJACK_HOTEL_API_KEY:'private'},wait:async()=>{},fetcher:async()=>new Response(stream)});
  await assert.rejects(()=>streamed.countries(),error=>error instanceof HotelCatalogueSupplierError&&error.code==='INVALID_RESPONSE');assert.equal(cancelled,true);
});

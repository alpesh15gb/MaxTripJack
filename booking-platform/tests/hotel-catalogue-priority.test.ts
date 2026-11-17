import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHotelCatalogueRepository,type HotelCatalogueSyncState} from '../src/lib/hotel-catalogue-repository';
import {syncHotelCatalogue,type HotelCatalogueClient} from '../src/lib/hotel-catalogue-sync';

const now=()=>new Date('2026-11-18T00:00:00Z');
const hash=(ids:string[])=>createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex');
const hotel=(id:string)=>({tjHotelId:id,name:`Supplier hotel ${id}`,is_active:true,
  locale:{address:{city:'Supplier City',fulladdr:'Verified supplier street address'}},
  amenities:{one:{name:'WiFi'},two:{name:'Parking'},three:{name:'Restaurant'},four:{name:'Reception'}}});
const checkpoint=(changes:Partial<HotelCatalogueSyncState>={}):HotelCatalogueSyncState=>({
  environment:'uat',countries:['ALBANIA','ANDORRA','ARGENTINA','FRANCE','INDIA','JAPAN'],countryIndex:2,mappingPage:3,
  pendingIds:[],contentOffset:0,mappingHasMore:false,pageLoaded:false,lastMappingHash:hash(['777']),
  generation:7,mappedCount:4274,contentCount:4274,missingCount:0,...changes,
});
async function fixture(){
  const db=new PGlite();
  for(const name of ['026-hotel-catalogue','028-hotel-catalogue-priority'])await db.exec(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
  const repository=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat',now);
  const atomic=async<T>(work:()=>Promise<T>)=>{await db.exec('BEGIN');try{const value=await work();await db.exec('COMMIT');return value;}catch(error){await db.exec('ROLLBACK');throw error;}};
  return {db,repository,atomic};
}

test('a fresh catalogue imports India first and still covers every other country in supplier order',async()=>{
  const {db,repository,atomic}=await fixture();const calls:string[]=[];let countryCalls=0;
  const client:HotelCatalogueClient={countries:async()=>{countryCalls++;return{hotelCountries:['ALBANIA','FRANCE','iNdIa','JAPAN']};},
    mapping:async(country,page)=>{calls.push(`${country}:${page}`);return{hotels:[{tjHotelId:String(calls.length)}],pageable:{totalPages:country==='iNdIa'?2:1}};},
    content:async ids=>({hotels:ids.map(hotel)})};
  try{
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.deepEqual(calls,['iNdIa:0']);assert.equal((await repository.readSync())?.generation,1);
    assert.deepEqual((await repository.readSync())?.countries,['iNdIa','ALBANIA','FRANCE','JAPAN']);
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:10});
    assert.deepEqual(calls,['iNdIa:0','iNdIa:1','ALBANIA:0','FRANCE:0','JAPAN:0']);assert.equal(countryCalls,1);
    assert.equal((await repository.stats()).countriesCompleted,4);assert.equal((await repository.stats()).syncComplete,true);
  }finally{await db.close();}
});

test('an existing page boundary prioritises India immediately and restores all remaining pages without restarting a generation',async()=>{
  const {db,repository,atomic}=await fixture();const calls:string[]=[];
  const client:HotelCatalogueClient={countries:async()=>{throw Error('Must reuse the country snapshot.');},
    mapping:async(country,page)=>{calls.push(`${country}:${page}`);return{hotels:[{tjHotelId:String(100+calls.length)}],pageable:{totalPages:country==='INDIA'?2:country==='ARGENTINA'?5:1}};},
    content:async ids=>({hotels:ids.map(hotel)})};
  try{
    await repository.writeSync(checkpoint());
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    const india=await repository.readSync();
    assert.deepEqual(calls,['INDIA:0']);assert.equal(india?.generation,7);assert.equal(india?.countryIndex,2);
    assert.equal(india?.mappingPage,1);assert.equal(india?.mappedCount,4275);assert.equal(india?.contentCount,4275);
    assert.deepEqual(india?.countries,['ALBANIA','ANDORRA','INDIA','ARGENTINA','FRANCE','JAPAN']);
    assert.deepEqual(india?.deferredCountry,{countryName:'ARGENTINA',mappingPage:3,lastMappingHash:hash(['777'])});
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    const restored=await repository.readSync();
    assert.equal(restored?.countries[restored.countryIndex],'ARGENTINA');assert.equal(restored?.mappingPage,3);
    assert.equal(restored?.lastMappingHash,hash(['777']));assert.equal(restored?.deferredCountry,undefined);
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:10});
    assert.deepEqual(calls,['INDIA:0','INDIA:1','ARGENTINA:3','ARGENTINA:4','FRANCE:0','JAPAN:0']);
    const done=await repository.readSync();assert.equal(done?.countryIndex,6);assert.equal(done?.generation,7);assert.ok(done?.completedAt);
  }finally{await db.close();}
});

test('partially loaded foreign content finishes under its original country before switching and survives an India interruption',async()=>{
  const {db,repository,atomic}=await fixture();const mappingCalls:string[]=[];const contentCalls:string[][]=[];let interrupt=true;
  const client:HotelCatalogueClient={countries:async()=>{throw Error('Must reuse snapshot.');},
    mapping:async(country,page)=>{mappingCalls.push(`${country}:${page}`);return{hotels:[{tjHotelId:country==='INDIA'?'201':'301'}],pageable:{totalPages:country==='ARGENTINA'?5:1}};},
    content:async ids=>{contentCalls.push(ids);if(interrupt&&ids.includes('201'))throw Error('Synthetic India interruption');return{hotels:ids.map(hotel)};}};
  try{
    await repository.discover(['101','102'],'ARGENTINA',7);await repository.markFetched(['101'],7);
    await repository.writeSync(checkpoint({pendingIds:['101','102'],contentOffset:1,pageLoaded:true,mappingHasMore:true,lastMappingHash:hash(['101','102'])}));
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.deepEqual(contentCalls,[['102']]);assert.deepEqual(mappingCalls,[]);
    assert.equal((await repository.get('102'))?.countryName,'ARGENTINA');
    const switched=await repository.readSync();assert.equal(switched?.countries[switched.countryIndex],'INDIA');
    assert.deepEqual(switched?.deferredCountry,{countryName:'ARGENTINA',mappingPage:4,lastMappingHash:hash(['101','102'])});
    await assert.rejects(()=>syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1}),/Synthetic India interruption/);
    const interrupted=await repository.readSync();assert.equal(interrupted?.pageLoaded,true);assert.equal(interrupted?.contentOffset,0);
    assert.deepEqual(interrupted?.deferredCountry,switched?.deferredCountry);assert.deepEqual(interrupted?.pendingIds,['201']);
    interrupt=false;
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.deepEqual(mappingCalls,['INDIA:0']);assert.equal((await repository.get('201'))?.countryName,'INDIA');
    const resumed=await repository.readSync();assert.equal(resumed?.mappingPage,4);assert.equal(resumed?.countries[resumed.countryIndex],'ARGENTINA');
    assert.equal(resumed?.deferredCountry,undefined);
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.deepEqual(mappingCalls,['INDIA:0','ARGENTINA:4']);assert.equal((await repository.get('301'))?.countryName,'ARGENTINA');
    assert.equal((await repository.readSync())?.generation,7);
  }finally{await db.close();}
});

test('a failed priority checkpoint commit retains the loaded country and resumes without fetching its content twice',async()=>{
  const {db,repository,atomic}=await fixture();const contentCalls:string[][]=[];
  const client:HotelCatalogueClient={countries:async()=>{throw Error('Must reuse snapshot.');},mapping:async()=>{throw Error('Loaded mapping must not repeat.');},
    content:async ids=>{contentCalls.push(ids);return{hotels:ids.map(hotel)};}};
  const failing={...repository,async writeSync(state:HotelCatalogueSyncState){await repository.writeSync(state);if(state.deferredCountry)throw Error('Synthetic priority transaction failure');}};
  try{
    await repository.discover(['102'],'ARGENTINA',7);
    await repository.writeSync(checkpoint({pendingIds:['102'],contentOffset:0,pageLoaded:true,mappingHasMore:true,lastMappingHash:hash(['102'])}));
    await assert.rejects(()=>syncHotelCatalogue({repository:failing,client,atomic,environment:'uat',now,maxPages:1}),/Synthetic priority transaction failure/);
    const failed=await repository.readSync();assert.equal(failed?.countries[failed.countryIndex],'ARGENTINA');
    assert.equal(failed?.pageLoaded,true);assert.equal(failed?.contentOffset,1);assert.equal(failed?.mappingPage,3);assert.equal(failed?.deferredCountry,undefined);
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.deepEqual(contentCalls,[['102']]);assert.equal((await repository.get('102'))?.countryName,'ARGENTINA');
    const recovered=await repository.readSync();assert.equal(recovered?.countries[recovered.countryIndex],'INDIA');assert.equal(recovered?.deferredCountry?.mappingPage,4);
  }finally{await db.close();}
});

test('restoring the paused country retains its repeated-mapping-page guard',async()=>{
  const {db,repository,atomic}=await fixture();const calls:string[]=[];
  const client:HotelCatalogueClient={countries:async()=>{throw Error('Must reuse snapshot.');},
    mapping:async(country,page)=>{calls.push(`${country}:${page}`);return{hotels:[{tjHotelId:country==='INDIA'?'888':'777'}],pageable:{totalPages:country==='INDIA'?1:5}};},content:async ids=>({hotels:ids.map(hotel)})};
  try{
    await repository.writeSync(checkpoint());
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    await assert.rejects(()=>syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1}),/repeated/);
    assert.deepEqual(calls,['INDIA:0','ARGENTINA:3']);assert.equal((await repository.readSync())?.mappingPage,3);
    assert.equal((await repository.readSync())?.lastMappingHash,hash(['777']));assert.equal((await repository.get('777')),undefined);
  }finally{await db.close();}
});

for(const countries of [['ALBANIA','FRANCE','JAPAN'],['INDIA','FRANCE','JAPAN']])test(`missing or completed India does not change remaining order (${countries[0]})`,async()=>{
  const {db,repository,atomic}=await fixture();const calls:string[]=[];
  const client:HotelCatalogueClient={countries:async()=>{throw Error('Must reuse snapshot.');},mapping:async(country,page)=>{calls.push(`${country}:${page}`);return{hotels:[],pageable:{totalPages:3}};},content:async()=>{throw Error('No content expected.');}};
  try{
    await repository.writeSync(checkpoint({countries,countryIndex:1,mappingPage:2}));
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.deepEqual(calls,['FRANCE:2']);const after=await repository.readSync();assert.deepEqual(after?.countries,countries);
    assert.equal(after?.countryIndex,2);assert.equal(after?.generation,7);assert.equal(after?.deferredCountry,undefined);
  }finally{await db.close();}
});

test('a completed country is not paused and the next refresh starts India first with a fresh cursor',async()=>{
  const {db,repository,atomic}=await fixture();const calls:string[]=[];
  const client:HotelCatalogueClient={countries:async()=>({hotelCountries:['ALBANIA','INDIA','JAPAN']}),
    mapping:async(country,page)=>{calls.push(`${country}:${page}`);return{hotels:[],pageable:{totalPages:1}};},content:async()=>{throw Error('No content expected.');}};
  try{
    await repository.writeSync(checkpoint({countries:['ALBANIA','ARGENTINA','INDIA'],countryIndex:1,mappingPage:0,lastMappingHash:undefined,pageLoaded:true,mappingHasMore:false}));
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    let state=await repository.readSync();assert.equal(state?.countries[state.countryIndex],'INDIA');assert.equal(state?.countryIndex,2);assert.equal(state?.deferredCountry,undefined);
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1});
    assert.ok((await repository.readSync())?.completedAt);
    await syncHotelCatalogue({repository,client,atomic,environment:'uat',now,maxPages:1,refresh:true});
    state=await repository.readSync();assert.equal(state?.generation,8);assert.deepEqual(state?.countries,['INDIA','ALBANIA','JAPAN']);
    assert.equal(state?.deferredCountry,undefined);assert.equal(state?.lastMappingHash,undefined);assert.deepEqual(calls,['INDIA:0','INDIA:0']);
  }finally{await db.close();}
});

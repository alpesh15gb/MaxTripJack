import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHotelCatalogueRepository} from '../src/lib/hotel-catalogue-repository';
import {catalogueAddress,catalogueHotelSlug,type HotelCatalogueContent} from '../src/lib/hotel-catalogue';
import {hotelSearchContext,normaliseHotelSearch} from '../src/lib/hotel-catalogue-search';

const now=()=>new Date('2026-11-17T00:00:00Z');
function hotel(hotelId:string,name:string,city:string,address:string,countryName='India'):HotelCatalogueContent {
  return {hotelId,name,city,address,countryName,slug:catalogueHotelSlug(name,city,hotelId),environment:'uat',active:true,contentReady:true,amenities:['Wi-Fi','Reception','Lift','Parking'],photos:[]};
}
async function fixture() {
  const db=new PGlite();
  for(const migration of ['026-hotel-catalogue','029-hotel-catalogue-search'])await db.exec(await readFile(new URL(`../db/${migration}.sql`,import.meta.url),'utf8'));
  const repository=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat',now);
  return {db,repository};
}

test('normalization folds accents and punctuation without erasing non-Latin script marks',()=>{
  assert.equal(normaliseHotelSearch('  HÔTEL Lumière — São_Paulo!  '),'hotel lumiere sao paulo');
  assert.equal(normaliseHotelSearch('Ｓｅａｓｏｎｓ Hotel'),'seasons hotel');
  assert.equal(normaliseHotelSearch('होटल सीजन्स, मीरा रोड'),'होटल सीजन्स मीरा रोड');
  assert.equal(normaliseHotelSearch('季節酒店，上海'),'季節酒店 上海');
  assert.equal(hotelSearchContext('%%%_&*'),undefined);
  assert.equal(hotelSearchContext(Array(26).fill('a').join(' ')),undefined);
  const context=hotelSearchContext('Seasons Hotel Mira Road')!;
  assert.equal(context.nameParts.length,6);
  assert.ok(context.nameParts.some((part,i)=>part==='seasons hotel'&&context.placeParts[i]==='mira road'));
  assert.ok(context.nameParts.some((part,i)=>part==='mira road'&&context.placeParts[i]==='seasons hotel'));
});

test('hotel browse puts real photos first and search sorts photos only within the same relevance rank',async()=>{
  const {db,repository}=await fixture();
  try {
    await db.exec(await readFile(new URL('../db/034-hotel-catalogue-photo-order.sql',import.meta.url),'utf8'));
    const legacyHeadline='A quiet beach house near the market. '+ 'x'.repeat(153) +' music syst';
    await repository.upsert({...hotel('1','A Beach House','Goa','Goa, India'),
      amenities:['Smoke-Complimentary Property','Smoke-free property'],descriptionHeadline:legacyHeadline.padEnd(200,'y').slice(0,200)});
    const repaired=await repository.get('1');
    assert.deepEqual(repaired?.amenities,['Smoke-free property']);
    assert.equal(repaired?.descriptionHeadline,'A quiet beach house near the market.');
    const photo={url:'https://pix8.agoda.net/hotelImages/1111/stay.jpg',isHero:true};
    await repository.upsert({...hotel('2','Z Beach House','Goa','Goa, India'),photos:[photo]});
    assert.deepEqual((await repository.list()).hotels.map(row=>row.hotelId),['2','1']);
    assert.deepEqual((await repository.list({query:'Goa'})).hotels.map(row=>row.hotelId),['2','1']);
    assert.deepEqual((await repository.list({query:'A Beach House'})).hotels.map(row=>row.hotelId),['1']);
    assert.equal(catalogueAddress('Plot 5, Anjuna Road, Anjuna, Goa Anjuna, Goa 403519 Goa India, Anjuna, Goa, India, 403519','Anjuna','India'),'Plot 5, Anjuna Road, Anjuna, Goa, 403519, India');
  } finally {await db.close();}
});

test('search migration backfills existing rows without changing supplier facts or canonical URLs',async()=>{
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('../db/026-hotel-catalogue.sql',import.meta.url),'utf8'));
    const repository=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'uat',now);
    await repository.upsert(hotel('1','Hôtel Lumière','São Paulo','Avenida Central, São Paulo','Brazil'));
    const original=await repository.get('1');
    await db.exec(await readFile(new URL('../db/029-hotel-catalogue-search.sql',import.meta.url),'utf8'));
    assert.deepEqual(await repository.get('1'),original);
    assert.deepEqual((await repository.list({query:'Hotel Lumiere Sao Paulo'})).hotels.map(item=>item.hotelId),['1']);
  } finally {await db.close();}
});

test('Mira Road matches a coherent locality, not Mira in a hotel name plus an unrelated Road',async()=>{
  const {db,repository}=await fixture();
  try {
    // Isolated examples model the reported false match; they are not live inventory.
    await repository.upsert(hotel('1','Hotel Mira Mare','Ksamil','Road Kol Jakova, Ksamil','Albania'));
    await repository.upsert(hotel('2','Seasons Hotel','Mira Road','Station Road, Mira Road, Maharashtra'));
    await repository.upsert(hotel('3','Seasons Hotel','Mumbai','Plot 17, Mira Road, Mumbai'));
    await repository.upsert(hotel('4','Mira Road','Goa','Beach Avenue, Goa'));
    await repository.upsert(hotel('5','Roadside Mira Palace','Ksamil','Mira Junction, Old Road','Albania'));
    await repository.upsert(hotel('6','Other Hotel','Mira Road','North Avenue, Mira Road'));
    const result=await repository.list({query:'Mira Road'});
    assert.equal(result.total,4);
    assert.deepEqual(result.hotels.map(item=>item.hotelId),['4','6','2','3']);
    for(const query of ['MIRA—ROAD','Mira_Road','Mira, Road'])assert.deepEqual((await repository.list({query})).hotels.map(item=>item.hotelId),result.hotels.map(item=>item.hotelId));
    assert.equal((await repository.list({query:'Missing Locality'})).total,0);
    // The unrelated Albania property remains findable by its actual name/location.
    assert.deepEqual((await repository.list({query:'Mira Mare Ksamil'})).hotels.map(item=>item.hotelId),['1']);
  } finally {await db.close();}
});

test('hotel plus city/locality searches work in both orders and rank exact combinations first',async()=>{
  const {db,repository}=await fixture();
  try {
    await repository.upsert(hotel('1','Seasons Hotel','Mira Road','Station Road, Mira Road'));
    await repository.upsert(hotel('2','AAA Seasons Hotel Annex','Mira Road','Main Avenue, Mira Road'));
    await repository.upsert(hotel('3','Seasons Hotel','Mumbai','Mira Road, Maharashtra, India'));
    await repository.upsert(hotel('4','Mira Mare Seasons Hotel','Ksamil','Road Kol Jakova','Albania'));
    await repository.upsert(hotel('5','Taj Palace','Mumbai','Harbour Avenue, Mumbai'));
    await repository.upsert(hotel('6','Mira Mare Seasons Hotel','Panaji','Road Kol Jakova, India'));
    for(const query of ['Seasons Hotel Mira Road','Mira Road Seasons Hotel','Hotel Seasons Mira Road']) {
      const result=await repository.list({query});
      assert.equal(result.total,3);assert.equal(result.hotels[0].hotelId,'1');
      assert.ok(!result.hotels.some(item=>['4','6'].includes(item.hotelId)));
    }
    for(const query of ['Taj Mumbai','Mumbai Taj'])assert.deepEqual((await repository.list({query})).hotels.map(item=>item.hotelId),['5']);
    for(const query of ['Seasons Hotel Mira Road India','India Seasons Hotel Mira Road','Mira Road India Seasons Hotel','India Mira Road Seasons Hotel']) {
      const result=await repository.list({query});
      assert.equal(result.total,3);assert.equal(result.hotels[0].hotelId,'1');
      assert.deepEqual(new Set(result.hotels.map(item=>item.hotelId)),new Set(['1','2','3']));
    }
    assert.equal((await repository.list({query:'Seasons Hotel Mira Road Albania'})).total,0,'Country qualification must not make disconnected locality words match');
    await repository.upsert(hotel('7','Seasons Hotel','Dubai','Airport Road, Garhoud, Dubai','United Arab Emirates'));
    for(const query of ['Seasons Hotel Airport Road United Arab Emirates','United Arab Emirates Seasons Hotel Airport Road'])assert.deepEqual((await repository.list({query})).hotels.map(item=>item.hotelId),['7']);
  } finally {await db.close();}
});

test('accent-insensitive and Unicode searches use the stored GIN projection',async()=>{
  const {db,repository}=await fixture();
  try {
    await repository.upsert(hotel('1','Hôtel Lumière','São Paulo','Avenida Central, São Paulo','Brazil'));
    await repository.upsert(hotel('2','होटल सीजन्स','मीरा रोड','स्टेशन मार्ग, मीरा रोड'));
    await repository.upsert(hotel('3','季節酒店','上海','南京路 上海','中国'));
    for(const query of ['hotel lumiere sao paulo','HÔTEL LUMIÈRE São-Paulo','São Paulo Hôtel Lumière'])assert.deepEqual((await repository.list({query})).hotels.map(item=>item.hotelId),['1']);
    assert.deepEqual((await repository.list({query:'होटल सीजन्स मीरा रोड'})).hotels.map(item=>item.hotelId),['2']);
    assert.deepEqual((await repository.list({query:'季節酒店 上海'})).hotels.map(item=>item.hotelId),['3']);
    for(const value of ['Hôtel Lumière — São_Paulo!','होटल सीजन्स, मीरा रोड','季節酒店，上海']) {
      const normalized=await db.query<{value:string}>('SELECT hotel_catalogue_search_text($1) AS value',[value]);
      assert.equal(normalized.rows[0].value,normaliseHotelSearch(value));
    }
    await db.exec('SET enable_seqscan=off');
    const plan=await db.query(`EXPLAIN SELECT hotel_id FROM hotel_catalogue WHERE search_normalized_document @@ plainto_tsquery('simple','hotel lumiere')`);
    assert.match(JSON.stringify(plan.rows),/hotel_catalogue_search_normalized/);
  } finally {await db.close();}
});

test('search filtering and ranking retain stable pagination, safe literals and environment/freshness boundaries',async()=>{
  const {db,repository}=await fixture();
  try {
    for(let i=1;i<=7;i++)await repository.upsert(hotel(String(i),`Hotel ${i}`,'Mira Road',`Building ${i}, Mira Road`));
    await repository.upsert(hotel('8','Hotel Mira Mare','Ksamil','Road Kol Jakova','Albania'));
    await repository.upsert({...hotel('9','Inactive','Mira Road','Mira Road'),active:false});
    await repository.upsert({...hotel('10','Incomplete','Mira Road','Mira Road'),contentReady:false});
    await repository.upsert(hotel('11','Old Stay','Mira Road','Mira Road'));
    await db.query("UPDATE hotel_catalogue SET checked_at='2025-01-01' WHERE hotel_id='11'");
    const production=createHotelCatalogueRepository((sql,values)=>db.query(sql,values),'production',now);
    await production.upsert({...hotel('12','Production','Mira Road','Mira Road'),environment:'production'});
    const pages=await Promise.all([1,2,3,4].map(page=>repository.list({page,pageSize:3,query:'Mira Road'})));
    assert.ok(pages.every(page=>page.total===7));
    assert.deepEqual(pages.map(page=>page.hotels.length),[3,3,1,0]);
    assert.equal(new Set(pages.flatMap(page=>page.hotels.map(item=>item.hotelId))).size,7);
    for(const query of ["'; DROP TABLE hotel_catalogue;--",'%%%___','Mira | Unknown','Mira & !Road']) {
      const result=await repository.list({query});
      if(query!=='Mira & !Road')assert.equal(result.total,0);
      else assert.equal(result.total,7,'FTS operators are punctuation, never executable query syntax');
    }
    assert.equal((await repository.list({query:''})).total,8);
    assert.equal((await production.list({query:'Mira Road'})).total,1);
  } finally {await db.close();}
});

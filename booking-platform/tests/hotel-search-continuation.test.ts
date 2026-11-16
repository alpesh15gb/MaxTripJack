import test from 'node:test';
import assert from 'node:assert/strict';
import {nextHotelSearchPage,appendHotelSearchPage} from '../src/lib/hotel-search-continuation';

test('empty destination pages advance without sending an invalid empty availability search',async()=>{
  let searched=false;
  const result=await nextHotelSearchPage('0:3',async()=>({hotelIds:[],nextCursor:'1:1'}),async()=>{searched=true;});
  assert.deepEqual(result,{result:null,nextCursor:'1:1'});assert.equal(searched,false);
});
test('availability or mapping failure cannot commit a cursor; retry uses the same inventory',async()=>{
  let cursor='0:3',attempt=0;
  const map=async(value:string)=>{assert.equal(value,'0:3');return {hotelIds:['123'],nextCursor:'0:4'};};
  const search=async(ids:string[])=>{assert.deepEqual(ids,['123']);if(++attempt===1)throw Error('Temporary availability failure');return {searchId:'owned-page'};};
  await assert.rejects(nextHotelSearchPage(cursor,map,search));assert.equal(cursor,'0:3');
  const result=await nextHotelSearchPage(cursor,map,search);cursor=result.nextCursor!;assert.equal(cursor,'0:4');
  await assert.rejects(nextHotelSearchPage(cursor,async()=>{throw Error('Mapping failed');},search));assert.equal(cursor,'0:4');
});
test('merged destination results keep each original search owner and deduplicate regions',()=>{
  const first:{tjHotelId:string;name:string;originSearchId?:string}[]=[{tjHotelId:'1',name:'First',originSearchId:'first-search'}];
  const merged=appendHotelSearchPage(first,'base-search',[{tjHotelId:'1',name:'Duplicate'},{tjHotelId:'2',name:'Second'},{tjHotelId:'2',name:'Duplicate second'}],'second-search');
  assert.deepEqual(merged,[{tjHotelId:'1',name:'First',originSearchId:'first-search'},{tjHotelId:'2',name:'Second',originSearchId:'second-search'}]);
  assert.deepEqual(first,[{tjHotelId:'1',name:'First',originSearchId:'first-search'}]);
  assert.equal(appendHotelSearchPage([{tjHotelId:'3'}],'base-search',[],'other-search')[0].originSearchId,'base-search');
});

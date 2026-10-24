import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceConditions, serviceDisclosure } from '../src/lib/service-conditions';
const rejected = {version:1,blocked:true,lines:[]};
test('fixture-backed service validity, restriction and complete alerts survive bounded projection',()=>{
 const raw={bookingId:'private-id',totalPriceInfo:{commission:123},travellerInfo:[{passport:'private'}],conditions:{st:180,restriction:'Extras cannot be refunded'},alerts:['Seat eligibility still applies']};
 const original=JSON.stringify(raw),output=serviceDisclosure(raw);
 assert.equal(output.blocked,false);
 assert.deepEqual(output.lines.map(line=>line.text),['180','Extras cannot be refunded','Seat eligibility still applies']);
 assert.equal(JSON.stringify(raw),original);
 assert.equal(JSON.stringify(output).includes('private'),false);
 assert.deepEqual(serviceConditions(output),output);
 assert.equal(serviceDisclosure({conditions:{},alerts:[]}).blocked,false);
 assert.equal(serviceDisclosure({conditions:{st:180},alerts:'Non-refundable'}).blocked,false);
});
test('unsupported terms are never silently dropped, partially rendered or passed through',()=>{
 const invalid=[undefined,null,[],{}, {conditions:null},{conditions:[]},
  ...['unknownCode','token','commission','password','dob','rule','fareRules'].map(key=>({conditions:{st:180,[key]:{value:'must-not-display'}}})),
  ...[null,{},['safe',{message:'must-not-display'}],['x'.repeat(2001)],Array(21).fill('notice')].map(alerts=>({conditions:{st:180},alerts})),
  ...[NaN,Infinity,-1,0,29,1.1,'180',null].map(st=>({conditions:{st}})),
  ...[{},false,5,'','x'.repeat(2001),'secret\u0000'].map(restriction=>({conditions:{restriction}}))];
 for(const value of invalid)assert.deepEqual(serviceDisclosure(value),rejected,JSON.stringify(value));
});
test('public DTO fails closed on missing, old/raw, future, malformed and arbitrary label data',()=>{
 const valid=serviceDisclosure({conditions:{st:180}});
 for(const value of [null,undefined,{}, {conditions:{st:180}}, {...valid,version:2}, {...valid,extra:'secret'}, {...valid,blocked:undefined}, {...valid,lines:[{label:'Commission',text:'123'}]}, {...valid,lines:[{label:'Supplier notice',text:{token:'secret'}}]}, {...valid,lines:Array(51).fill(valid.lines[0])}, {...valid,lines:[{...valid.lines[0],extra:'secret'}]}, {...valid,blocked:true}])assert.deepEqual(serviceConditions(value),rejected);
});

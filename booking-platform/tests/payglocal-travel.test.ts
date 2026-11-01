import test from "node:test";
import assert from "node:assert/strict";
import { buildPayGlocalTravelData, payGlocalTravelSchema } from "../src/lib/providers/payglocal-travel";
import { airportInstant } from "../src/lib/airport-instant";
import { flightTravelSource, hotelTravelSource } from "./fixtures/payglocal-travel";
import { PAYGLOCAL_CONFIRMATION_BLOCKERS, assertPayGlocalTravelContract } from "../src/lib/providers/payglocal-travel-contract";

const trips = (s: ReturnType<typeof flightTravelSource>) => (s.review as {tripInfos:{sI:Record<string,unknown>[];totalPriceList:unknown[]}[]}).tripInfos;
test("flight risk data uses reviewed segments and guest names, never fake ticket/PII", () => {
  const s = flightTravelSource();
  Object.assign(s.travellers[0], { pan: "PRIVATE", pNum: "PRIVATE", email: "private@example.test" });
  const p = buildPayGlocalTravelData(s);
  assert.equal(p.product, "FLIGHT"); if(p.product!=="FLIGHT")return;
  const f=p.riskData.flightData[0];assert.equal(f.journeyType,"ONEWAY");assert.equal(f.reservationDate,"20261101");
  assert.equal(f.legData[0].departureDate,"2027-01-10T04:30:00Z");assert.equal(f.legData[0].arrivalDate,"2027-01-10T06:30:00Z");
  assert.equal(f.legData[0].departureCountry,"IN");assert.deepEqual(f.passengerData,[{firstName:"Test",lastName:"Traveller"}]);
  assert.ok(!JSON.stringify(p).includes("PRIVATE"));assert.ok(!("ticketNumber" in f));
  assert.deepEqual(buildPayGlocalTravelData(s),p);
});
test("return and connecting routes preserve route IDs and connection leg order",()=>{
  const s=flightTravelSource(); if(s.criteria.product!=="FLIGHT")return;s.criteria.returnDate="2027-01-12";
  const t=trips(s)[0], segment=t.sI[0];
  t.sI=[{...segment,aa:{code:"BLR"},at:"2027-01-10T11:30:00"},{...segment,da:{code:"BLR"},dt:"2027-01-10T12:30:00",at:"2027-01-10T15:30:00"}];
  trips(s).push({...t,sI:[{...segment,da:{code:"DEL"},aa:{code:"BOM"},dt:"2027-01-12T10:00:00",at:"2027-01-12T12:30:00"}]});
  const p=buildPayGlocalTravelData(s);if(p.product!=="FLIGHT")throw Error();
  assert.equal(p.riskData.flightData[0].journeyType,"RETURN");assert.deepEqual(p.riskData.flightData[0].legData.map(l=>[l.routeId,l.legId]),[["1","1"],["1","2"],["2","1"]]);
});
test("international times use departure and arrival zones independently",()=>{
  const s=flightTravelSource();if(s.criteria.product!=="FLIGHT")return;s.criteria.to="DXB";
  trips(s)[0].sI[0]={...trips(s)[0].sI[0],aa:{code:"DXB"},at:"2027-01-10T12:00:00"};
  const p=buildPayGlocalTravelData(s);if(p.product!=="FLIGHT")throw Error();
  const l=p.riskData.flightData[0].legData[0];assert.equal(l.departureDate,"2027-01-10T04:30:00Z");assert.equal(l.arrivalDate,"2027-01-10T08:00:00Z");assert.equal(l.arrivalCountry,"AE");
});
test("unknown/incomplete/mismatched flight data blocks preparation",()=>{
  for(const mutate of [
    (s:ReturnType<typeof flightTravelSource>)=>{trips(s)[0].sI[0].da={code:"ZZZ"};},
    (s:ReturnType<typeof flightTravelSource>)=>{trips(s)[0].sI[0].at="2027-01-10T09:00:00";},
    (s:ReturnType<typeof flightTravelSource>)=>{trips(s)[0].sI[0].dt="2027-01-11T10:00:00";},
    (s:ReturnType<typeof flightTravelSource>)=>{trips(s)[0].totalPriceList=[];},
    (s:ReturnType<typeof flightTravelSource>)=>{s.travellers=[];},
    (s:ReturnType<typeof flightTravelSource>)=>{s.reservedAt=new Date("invalid");},
    (s:ReturnType<typeof flightTravelSource>)=>{s.review={tripInfos:[]};},
  ]){const s=flightTravelSource();mutate(s);assert.throws(()=>buildPayGlocalTravelData(s));}
});
test("multi-city payment is explicitly held until its merchant representation is confirmed",()=>{
  const s=flightTravelSource();if(s.criteria.product!=="FLIGHT")return;s.criteria.legs=[{from:"BOM",to:"DEL",date:"2027-01-10"},{from:"DEL",to:"DXB",date:"2027-01-12"}];assert.throws(()=>buildPayGlocalTravelData(s),{status:503});
});
test("hotel mapping uses property geography, dates and rating; no invented policy code",()=>{
  const s=hotelTravelSource();if(s.criteria.product!=="HOTEL")return;s.criteria.rooms=[{adults:2,children:1,childAge:[6]},{adults:1,children:0,childAge:[]}];
  const p=buildPayGlocalTravelData(s);if(p.product!=="HOTEL")throw Error();
  assert.deepEqual(p.riskData.lodgingData,[{checkInDate:"20270110",checkOutDate:"20270112",city:"Panaji",country:"IN",lodgingType:"Hotel",lodgingName:"Fixture Hotel",rating:"4"}]);
  assert.ok(!JSON.stringify(p).includes("cancellationPolicy"));
  for(const countryCode of ["IND","","India"]){assert.throws(()=>buildPayGlocalTravelData({...s,hotel:{...s.hotel!,countryCode}}));}
  assert.throws(()=>buildPayGlocalTravelData({...s,hotel:undefined}),{status:503});
});
test("risk schemas reject injected payment/card/passport fields",()=>{
  const s=buildPayGlocalTravelData(flightTravelSource());assert.throws(()=>payGlocalTravelSchema.parse({...s,riskData:{...s.riskData,cardData:{number:"4111111111111111"}}}));
});
test("all confirmations remain immutable code gates regardless of environment flags",()=>{
  assert.ok(PAYGLOCAL_CONFIRMATION_BLOCKERS.includes("WEBHOOK_SIGNATURE_ENVELOPE"));assert.ok(Object.isFrozen(PAYGLOCAL_CONFIRMATION_BLOCKERS));
  process.env.PAYGLOCAL_ENABLE_CHECKOUT="true";try{assert.throws(assertPayGlocalTravelContract,{status:503});}finally{delete process.env.PAYGLOCAL_ENABLE_CHECKOUT;}
});
for(const [airport,value,expected] of [
 ["BOM","2027-01-10T10:00:00","2027-01-10T04:30:00Z"],
 ["LHR","2027-07-10T10:00:00","2027-07-10T09:00:00Z"],
 ["LHR","2027-01-10T10:00:00","2027-01-10T10:00:00Z"],
 ["KTM","2027-01-10T10:00:00","2027-01-10T04:15:00Z"],
 ["LHR","2027-03-28T01:30:00",null],
 ["LHR","2027-10-31T01:30:00",null],
 ["ZZZ","2027-01-10T10:00:00",null],
 ["BOM","2027-02-30T10:00:00",null],
 ["BOM","2027-01-10T10:00:00+05:30","2027-01-10T04:30:00Z"],
] as const)test(`airport timestamp ${airport} ${value}`,()=>assert.equal(airportInstant(value,airport),expected));

import test from "node:test";
import assert from "node:assert/strict";
import { customerFlightResults,customerHotelOptions,customerTotal } from "../src/lib/customer-pricing";
import { searchSchema } from "../src/lib/providers/contracts";
import type { Flight } from "../src/lib/booking-presentation";
import { flightSeatInventoryExpiry } from "../src/lib/flight-seat-inventory";
test("search pricing applies booking fees once and hides supplier commission/net fields",()=>{const criteria=searchSchema.parse({product:"FLIGHT",from:"BOM",to:"DEL",date:"2026-12-20",adults:2});assert.equal(criteria.product,"FLIGHT");if(criteria.product!=="FLIGHT")return;const rule={markup_minor:10000,markup_basis_points:500,service_fee_minor:2000};const result=customerFlightResults({searchResult:{tripInfos:{ONWARD:[{sI:[],totalPriceList:[{id:"fare",fareIdentifier:"PUBLISHED",fD:{ADULT:{fC:{TF:5000,NF:4500,NCM:500},bI:{iB:"15kg"}}}}]}]}}},criteria,rule);assert.equal(JSON.stringify(result).includes('"NF"'),false);assert.equal(JSON.stringify(result).includes('"NCM"'),false);const fare=(result.searchResult.tripInfos.ONWARD[0] as {totalPriceList:{customerEstimateMinor:number}[]}).totalPriceList[0];assert.equal(fare.customerEstimateMinor,1062000);assert.equal(customerTotal(1000000,rule),1062000);});
test("search projects only documented adult fare seat counts while the original search is fresh",()=>{
 const criteria=searchSchema.parse({product:"FLIGHT",from:"BOM",to:"DEL",date:"2026-12-20",adults:2,children:1});
 assert(criteria.product==="FLIGHT");
 const values=[4,0,"3",-1,3.5,Number.MAX_SAFE_INTEGER+1,null,undefined];
 const source={searchResult:{tripInfos:{ONWARD:[{
  sI:[{sR:2,sA:8}],
  totalPriceList:values.map((sR,index)=>({id:String(index),sR:7,fd:{
   ADULT:{sR,fC:{TF:5000,sR:8,NCM:1000}},
   CHILD:{sR:9,fC:{TF:3000}},
  }})),
 }]}}};
 const expiresAt=flightSeatInventoryExpiry(10_000,20_000);
 assert.equal(expiresAt,70_000);
 const result=customerFlightResults(source,criteria,undefined,expiresAt);
 assert.equal(result.flightInventoryExpiresAt,expiresAt);
 const [trip]=result.searchResult.tripInfos.ONWARD as Flight[];
 assert.deepEqual(trip.totalPriceList.map(fare=>fare.fD.ADULT.sR),[4,0,undefined,undefined,undefined,undefined,undefined,undefined]);
 assert.equal(trip.totalPriceList[0].customerEstimateMinor,1_300_000);
 assert.equal(trip.totalPriceList[0].fD.CHILD.sR,undefined);
 assert.equal(JSON.stringify(result).match(/"sR"/g)?.length,2);
 assert.equal(JSON.stringify(result).includes('"NCM"'),false);
 for(const expiry of [undefined,flightSeatInventoryExpiry(10_000,70_000),flightSeatInventoryExpiry(30_000,20_000)]){
  const restored=customerFlightResults(source,criteria,undefined,expiry);
  assert.equal(restored.flightInventoryExpiresAt,undefined);
  assert.equal(JSON.stringify(restored).includes('"sR"'),false);
 }
});
test("hotel room presentation hides supplier review hash and marks up the full stay once",()=>{const result=customerHotelOptions({reviewHash:"PRIVATE",options:[{optionId:"room",pricing:{totalPrice:5000,currency:"INR",netPrice:4000}}]},{markup_minor:10000,markup_basis_points:0,service_fee_minor:2000});assert.equal(result.options[0].pricing.totalPrice,5120);assert.equal(JSON.stringify(result).includes("PRIVATE"),false);assert.equal(JSON.stringify(result).includes("netPrice"),false);});
test("hotel markup cannot disguise an invalid missing supplier price",()=>{const rule={markup_minor:10000,markup_basis_points:0,service_fee_minor:2000};for(const totalPrice of [null,undefined,"",false])assert.throws(()=>customerHotelOptions({options:[{optionId:"room",pricing:{totalPrice,currency:"INR"}}]},rule));});

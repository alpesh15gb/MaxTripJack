import test from "node:test";
import assert from "node:assert/strict";
import { searchSchema,flightSearch } from "../src/lib/providers/contracts";
import { orderedFlightSelection } from "../src/lib/flight-selection";
import { cancellationOptions,selectCancellationScope,cancellationBody } from "../src/lib/cancellation-scope";
const flight={product:"FLIGHT" as const,from:"BOM",to:"DEL",date:"2027-01-01",adults:2,children:0,infants:0,cabin:"ECONOMY" as const};
const legs=[{from:"BOM",to:"DEL",date:"2027-01-01"},{from:"DEL",to:"BLR",date:"2027-01-03"},{from:"BLR",to:"BOM",date:"2027-01-05"}];
test("multi-city validates two to six chronological routes and emits exact supplier routes",()=>{
 const criteria=searchSchema.parse({...flight,legs});assert.equal(criteria.product,"FLIGHT");if(criteria.product!=="FLIGHT")return;
 assert.deepEqual(flightSearch(criteria).searchQuery.routeInfos.map(r=>r.fromCityOrAirport.code),["BOM","DEL","BLR"]);
 for(const invalid of [{...flight,legs,returnDate:"2027-01-06"},{...flight,legs:[legs[0]]},{...flight,legs:[legs[0],{...legs[1],date:"2026-12-30"}]},{...flight,legs:[legs[0],{...legs[1],to:"DEL"}]},{...flight,legs:[{...legs[0],from:"GOI"},legs[1]]}])assert.equal(searchSchema.safeParse(invalid).success,false);
});
const trips=(id:string)=>[{totalPriceList:[{id}]}];
test("multi-city review requires exactly one fare per group in route order",()=>{
 const groups={"2":trips("c"),"0":trips("a"),"1":trips("b")};
 assert.deepEqual(orderedFlightSelection(groups,["c","a","b"],{legs}),["a","b","c"]);
 for(const ids of [["a","b"],["a","a","b"],["a","b","forged"]])assert.throws(()=>orderedFlightSelection(groups,ids,{legs}));
 assert.throws(()=>orderedFlightSelection({"0":trips("a"),"2":trips("b")},["a","b"],{legs}));
 assert.deepEqual(orderedFlightSelection({COMBO:trips("combo")},["combo"],{legs}),["combo"]);
});
test("return and special-return validation cannot mix unrelated fares",()=>{
 assert.deepEqual(orderedFlightSelection({ONWARD:trips("a"),RETURN:trips("b")},["b","a"],{returnDate:"2027-01-05"}),["a","b"]);
 const groups={ONWARD:[{totalPriceList:[{id:"a",fareIdentifier:"SPECIAL_RETURN",sri:"pair"}]}],RETURN:[{totalPriceList:[{id:"b",fareIdentifier:"SPECIAL_RETURN",msri:["other"]}]}]};
 assert.throws(()=>orderedFlightSelection(groups,["a","b"],{returnDate:"2027-01-05"}));
});
const options=cancellationOptions({}, {travellers:[{fN:"Asha",lN:"Shah"},{fN:"Ravi",lN:"Shah"}]}, {...flight,returnDate:"2027-01-05"});
test("partial cancellation uses stored names/routes and excludes previously cancelled units",()=>{
 const first=selectCancellationScope(options,[{tripIndex:0,travellerIndexes:[1]}],[]);
 assert.equal(first.isPartial,true);assert.deepEqual(first.scope?.units,["0:1"]);
 assert.deepEqual(cancellationBody({supplier_booking_id:"booked",reason:"Customer request",scope:first.scope}).trips,[{src:"BOM",dest:"DEL",departureDate:"2027-01-01",travellers:[{fn:"Ravi",ln:"Shah"}]}]);
 assert.throws(()=>selectCancellationScope(options,[{tripIndex:0,travellerIndexes:[1]}],[first.scope]));
 assert.throws(()=>selectCancellationScope(options,[{tripIndex:8,travellerIndexes:[0]}],[]));
 assert.throws(()=>selectCancellationScope(options,[{tripIndex:0,travellerIndexes:[0,0]}],[]));
 const remaining=selectCancellationScope(options,undefined,[first.scope]);assert.equal(remaining.isPartial,false);assert.deepEqual(remaining.scope?.units,["0:0","1:0","1:1"]);
 assert.throws(()=>selectCancellationScope(options,undefined,[null]));
});
test("ambiguous names require staff assistance for partial cancellation",()=>{
 const ambiguous=cancellationOptions({}, {travellers:[{fN:"Asha",lN:"Shah"},{fN:"asha",lN:"shah"}]},flight);
 assert.equal(ambiguous.trips.length,0);assert.throws(()=>selectCancellationScope(ambiguous,[{tripIndex:0,travellerIndexes:[0]}],[]));
 assert.deepEqual(selectCancellationScope(ambiguous,undefined,[]),{scope:null,isPartial:false});
});

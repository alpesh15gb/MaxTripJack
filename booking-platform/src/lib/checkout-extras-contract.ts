import { z } from "zod";
import { minor, type Search } from "./providers/contracts";
export const checkoutChoices=z.array(z.object({segmentId:z.string().min(1).max(100),travellerIndex:z.number().int().min(0).max(17),kind:z.enum(["BAGGAGE","MEAL","SEAT"]),code:z.string().min(1).max(100)}).strict()).max(972);
export type CheckoutChoice=z.infer<typeof checkoutChoices>[number];
export type CheckoutSegment={id:string;tripIndex:number;label:string;options:{kind:"BAGGAGE"|"MEAL"|"SEAT";code:string;label:string;amountMinor:number;exitRow?:boolean}[]};
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{};
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(obj):[];
export function checkoutCatalogue(review:unknown,seats:unknown):CheckoutSegment[]{
 const maps=obj(obj(obj(seats).tripSeatMap).tripSeat??obj(seats).tripSeatMap),segments:CheckoutSegment[]=[];
 for(const [tripIndex,trip] of list(obj(review).tripInfos).entries())for(const segment of list(trip.sI)){
  if(typeof segment.id!=="string"||!segment.id||segments.some(s=>s.id===segment.id))throw Error("Supplier segment identifiers are incomplete or duplicated.");
  const options:CheckoutSegment["options"]=[];
  for(const kind of ["BAGGAGE","MEAL"] as const)for(const option of list(obj(segment.ssrInfo)[kind]))if(typeof option.code==="string"&&typeof option.amount==="number"&&option.amount>=0)options.push({kind,code:option.code,label:typeof option.desc==="string"?option.desc:option.code,amountMinor:minor(option.amount)});
  for(const seat of list(obj(maps[segment.id]).sInfo))if(seat.isBooked===false&&typeof seat.code==="string"&&typeof seat.amount==="number"&&seat.amount>=0)options.push({kind:"SEAT",code:seat.code,label:`Seat ${String(seat.seatNo??seat.code)}${seat.isExitRow?" · Exit row":""}${seat.isLegRoom?" · Extra legroom":""}`,amountMinor:minor(seat.amount),exitRow:seat.isExitRow===true});
  segments.push({id:segment.id,tripIndex,label:`${String(obj(segment.da).code??"")} → ${String(obj(segment.aa).code??"")} · ${String(segment.dt??"")}`,options});
 }
 if(segments.length>36)throw Error("Supplier itinerary has too many segments.");return segments;
}
export function selectCheckoutExtras(review:unknown,seats:unknown,criteria:Extract<Search,{product:"FLIGHT"}>,choices:CheckoutChoice[]){
 const catalogue=checkoutCatalogue(review,seats),used=new Set<string>(),seatKeys=new Set<string>();
 const travellerTypes=[...Array<string>(criteria.adults).fill("ADULT"),...Array<string>(criteria.children).fill("CHILD"),...Array<string>(criteria.infants).fill("INFANT")];
 const travellers=travellerTypes.map(pt=>({pt,ssrBaggageInfos:[] as {key:string;code:string}[],ssrMealInfos:[] as {key:string;code:string}[],ssrSeatInfos:[] as {key:string;code:string}[]}));
 let amountMinor=0;const summary:{travellerIndex:number;segment:string;kind:string;label:string;amountMinor:number}[]=[];
 for(const choice of choices){
  const segment=catalogue.find(s=>s.id===choice.segmentId),option=segment?.options.find(o=>o.kind===choice.kind&&o.code===choice.code),traveller=travellers[choice.travellerIndex];
  const key=`${choice.kind}:${choice.kind==="BAGGAGE"?segment?.tripIndex:choice.segmentId}:${choice.travellerIndex}`;
  if(!segment||!option||!traveller||traveller.pt==="INFANT"||used.has(key))throw Error("Select one current extra per passenger and segment; baggage applies once to the whole journey. Infants cannot select extras.");used.add(key);
  if(option.exitRow)throw Error("Exit-row seats require eligibility checks; choose another seat or contact support.");
  if(choice.kind==="SEAT"){const seatKey=`${choice.segmentId}:${choice.code}`;if(seatKeys.has(seatKey))throw Error("Two passengers cannot select the same seat.");seatKeys.add(seatKey);}
  const field=choice.kind==="BAGGAGE"?"ssrBaggageInfos":choice.kind==="MEAL"?"ssrMealInfos":"ssrSeatInfos";
  const targets=choice.kind==="BAGGAGE"?catalogue.filter(s=>s.tripIndex===segment.tripIndex):[segment];
  for(const target of targets){
   const rawSegment=list(list(obj(review).tripInfos)[target.tripIndex]?.sI).find(s=>s.id===target.id);
   if(choice.kind==="BAGGAGE"&&!list(obj(rawSegment?.ssrInfo).BAGGAGE).some(o=>o.code===choice.code))throw Error("Connecting baggage is not offered across every segment.");
   traveller[field].push({key:target.id,code:choice.code});
  }
  amountMinor+=option.amountMinor;summary.push({travellerIndex:choice.travellerIndex,segment:segment.label,kind:choice.kind,label:option.label,amountMinor:option.amountMinor});
 }
 if(!Number.isSafeInteger(amountMinor))throw Error("Invalid extras total.");return {amountMinor,travellers,summary};
}
/** Supplier success alone must not silently confirm extras that were not fulfilled. */
export function checkoutExtrasFulfilled(details:unknown,guests:{travellers:{fN:string;lN:string;pt:string}[]},extras?:{travellers:{ssrBaggageInfos:{key:string;code:string}[];ssrMealInfos:{key:string;code:string}[];ssrSeatInfos:{key:string;code:string}[]}[]}){
 if(!extras)return true;const people:Row[]=[];
 function visit(value:unknown){if(Array.isArray(value)){value.forEach(visit);return;}const row=obj(value);if(typeof row.fN==="string"&&typeof row.lN==="string"&&(row.ssrBaggageInfos||row.ssrMealInfos||row.ssrSeatInfos))people.push(row);Object.values(row).forEach(v=>{if(v&&typeof v==="object")visit(v);});}visit(details);
 return extras.travellers.every((expected,i)=>{
  const fields=["ssrBaggageInfos","ssrMealInfos","ssrSeatInfos"] as const;
  if(fields.every(f=>!expected[f].length))return true;
  const guest=guests.travellers[i];if(!guest)return false;const matches=people.filter(p=>p.fN===guest.fN&&p.lN===guest.lN&&(!p.pt||p.pt===guest.pt));if(matches.length!==1)return false;
  return fields.every(field=>expected[field].every(option=>{const value=matches[0][field];if(Array.isArray(value))return list(value).some(v=>v.key===option.key&&v.code===option.code);return obj(obj(value)[option.key]).code===option.code||obj(value)[option.key]===option.code;}));
 });
}

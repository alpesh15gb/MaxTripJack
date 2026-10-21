import {z} from 'zod';
import {indiaToday} from './booking-presentation';

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
const room=z.object({adults:z.number().int().min(1).max(4),childAge:z.array(z.number().int().min(0).max(17)).max(3),children:z.number().int().min(0).max(3).optional()}).refine(value=>value.children===undefined||value.children===value.childAge.length);
const leg=z.object({from:z.string().regex(/^[A-Z]{3}$/),to:z.string().regex(/^[A-Z]{3}$/),date:day}).refine(value=>value.from!==value.to);
const roomsSchema=z.array(room).min(1).max(4);
const legsSchema=z.array(leg).min(2).max(6);
export type SearchRoom={adults:number;childAge:number[]};
export type SearchLeg={from:string;to:string;date:string};
export function searchRooms(value?:string):SearchRoom[]|undefined {try{return roomsSchema.parse(JSON.parse(value??'null')).map(({adults,childAge})=>({adults,childAge}));}catch{return undefined;}}
export function searchLegs(value?:string):SearchLeg[]|undefined {try{return legsSchema.parse(JSON.parse(value??'null'));}catch{return undefined;}}

/** Only bounded, public search criteria survive refresh/authentication. Never copy form data wholesale. */
export function bookingSearchPrefill(query:Record<string,string|string[]|undefined>,today=indiaToday()):Record<string,string>{
  const result:Record<string,string>={};
  const limits:Record<string,number>={product:6,from:3,to:3,date:10,end:10,returnDate:10,adults:1,children:1,infants:1,cabin:20,city:150,nationality:10,hotelIds:2000,rooms:700,legs:1000,autoSearch:1,resumeSelection:1};
  let invalid=false;
  for(const [key,max] of Object.entries(limits)){
    const value=query[key];if(value===undefined)continue;
    if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){invalid=true;continue;}
    result[key]=value;
  }
  for(const key of ['date','end','returnDate'])if(result[key]&&(!day.safeParse(result[key]).success||result[key]<today))invalid=true;
  for(const key of ['from','to'])if(result[key]&&!/^[A-Z]{3}$/.test(result[key]))invalid=true;
  for(const key of ['adults','children','infants'])if(result[key]&&!/^\d$/.test(result[key]))invalid=true;
  if(result.adults==='0'||Number(result.adults??1)+Number(result.children??0)>9||Number(result.infants??0)>Number(result.adults??1))invalid=true;
  if(result.cabin&&!['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'].includes(result.cabin))invalid=true;
  if(result.hotelIds&&!/^\d+(,\d+){0,99}$/.test(result.hotelIds))invalid=true;
  if(result.nationality&&!/^\d+$/.test(result.nationality))invalid=true;
  if(result.rooms){const rooms=searchRooms(result.rooms);if(!rooms)invalid=true;else result.rooms=JSON.stringify(rooms);}
  if(result.legs){const legs=searchLegs(result.legs);if(!legs||legs.some((leg,index)=>leg.date<today||(index>0&&leg.date<legs[index-1].date)))invalid=true;else{result.legs=JSON.stringify(legs);result.from=legs[0].from;result.to=legs[0].to;result.date=legs[0].date;delete result.returnDate;}}
  if(result.returnDate&&result.date&&result.returnDate<result.date)invalid=true;
  if(result.end&&result.date&&result.end<=result.date)invalid=true;
  if(invalid)return {product:result.product==='HOTEL'?'HOTEL':'FLIGHT',searchInvalid:'1'};
  return result;
}

/** The auth return URL is capped at 2048. Leave room for resumeSelection. Never truncate inventory. */
export function bookingSearchUrl(criteria:Record<string,string>,today=indiaToday()):string|null{
  const safe=bookingSearchPrefill(criteria,today);
  if(safe.searchInvalid)return null;
  const url='/book?'+new URLSearchParams(safe).toString();
  return url.length<=2000?url:null;
}

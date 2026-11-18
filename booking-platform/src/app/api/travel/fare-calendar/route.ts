import {z} from 'zod';
import {body,json,sameOrigin} from '@/lib/http';
import {readFareCalendar,refreshFareCalendar} from '@/lib/fare-calendar';
import {addDays,CABINS,FARE_CALENDAR_MAX_DAYS,isDay} from '@/lib/fare-calendar-core';
import {shoppingPeer} from '@/lib/guest-shopping-policy';
import {indiaToday} from '@/lib/booking-presentation';

const code=z.string().regex(/^[A-Z]{3}$/);
const route=z.object({from:code,to:code,cabin:z.enum(CABINS).default('ECONOMY')}).refine(value=>value.from!==value.to);
const empty=(status=200)=>json({days:{}},status);

/** Indicative lowest one-adult fares per day. Public, cacheable for a minute. */
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const parsed=route.safeParse({from:params.get('from')?.toUpperCase(),to:params.get('to')?.toUpperCase(),cabin:params.get('cabin')??undefined});
 const today=indiaToday();
 const requested=params.get('start');
 const start=isDay(requested)&&requested>=today?requested:today;
 const days=Math.min(FARE_CALENDAR_MAX_DAYS,Math.max(1,Number(params.get('days'))||45));
 if(!parsed.success)return empty();
 try{
  const response=json(await readFareCalendar(parsed.data,start,days));
  response.headers.set('Cache-Control','public, max-age=60, stale-while-revalidate=240');
  return response;
 }catch{return empty();}
}

/** Prepare fares around a departure when they are older than five minutes.
 * Fire-and-forget: responds immediately, the refresh runs in the background. */
export async function POST(request:Request){
 try{
  sameOrigin(request);
  const input=await body(request,z.object({from:code,to:code,cabin:z.enum(CABINS).default('ECONOMY'),date:z.string().refine(isDay)}).strict());
  if(input.from===input.to||process.env.SEARCH_PREWARM_ENABLED==='false')return new Response(null,{status:204});
  const today=indiaToday();
  const center=input.date<today?today:input.date;
  const first=addDays(center,-2)<today?today:addDays(center,-2);
  const dates=Array.from({length:7},(_,index)=>addDays(first,index));
  void refreshFareCalendar({from:input.from,to:input.to,cabin:input.cabin},dates,shoppingPeer(request,process.env.PUBLIC_SHOPPING_TRUST_PROXY==='true'));
  return new Response(null,{status:202,headers:{'Cache-Control':'private, no-store'}});
 }catch{return new Response(null,{status:204});}
}

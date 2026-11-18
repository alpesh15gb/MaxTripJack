'use client';
import {useEffect,useState} from 'react';
import type {FareCalendarDay} from '@/lib/fare-calendar-core';

type Fares=Record<string,FareCalendarDay>;
const memory=new Map<string,{at:number;days:Fares}>();
const FRESH_MS=60_000;

/** Loads indicative "from" fares for a route and asks the server to refresh any
 * day older than five minutes, then re-reads once so warmed prices appear. */
export default function useFareCalendar(from:string,to:string,cabin:string,anchor:string,enabled=true){
 const key=`${from}-${to}-${cabin}`;
 const valid=enabled&&/^[A-Z]{3}$/.test(from)&&/^[A-Z]{3}$/.test(to)&&from!==to;
 const [state,setState]=useState<{key:string;days:Fares}>(()=>({key,days:memory.get(key)?.days??{}}));
 useEffect(()=>{
  if(!valid)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const load=()=>fetch(`/api/travel/fare-calendar?${new URLSearchParams({from,to,cabin,days:'62'})}`,{signal:controller.signal})
   .then(response=>response.ok?response.json():null).then(data=>{
    if(!data||typeof data.days!=='object')return;
    memory.set(key,{at:Date.now(),days:data.days});setState({key,days:data.days});
   }).catch(()=>{});
  const cached=memory.get(key);
  if(!cached||Date.now()-cached.at>FRESH_MS)void load();
  // Background refresh of stale days near the chosen date; re-read when it settles.
  const delay=setTimeout(()=>{
   void fetch('/api/travel/fare-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from,to,cabin,date:anchor}),signal:controller.signal})
    .then(response=>{if(response.status===202)timer=setTimeout(()=>void load(),6000);}).catch(()=>{});
  },350);
  return()=>{controller.abort();clearTimeout(delay);if(timer)clearTimeout(timer);};
 },[valid,key,from,to,cabin,anchor]);
 if(!valid)return {};
 return state.key===key?state.days:memory.get(key)?.days??{};
}

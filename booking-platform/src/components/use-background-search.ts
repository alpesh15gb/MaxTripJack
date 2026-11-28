'use client';
import {useCallback,useEffect,useRef,type RefObject} from 'react';
import {authClient} from '@/lib/auth-client';
import {backgroundSearchAllowed,invalidateBackgroundSearch,syncBackgroundSearchIdentity,warmBackgroundSearch} from '@/lib/background-search';
import type {Search} from '@/lib/providers/contracts';

/** Prepare complete criteria quietly; only an explicit search can display results. */
export default function useBackgroundSearch({form,read,enabled,formKey='',editingResults=false,preloadOnMount=false}:{form:RefObject<HTMLFormElement|null>;read:()=>Search|null;enabled:boolean;formKey?:string;editingResults?:boolean;preloadOnMount?:boolean}){
 const {data:session,isPending}=authClient.useSession();
 const owner=session?.user.id??'guest';
 const latest=useRef({read,enabled:false,interactive:enabled});
 const initial=useRef(preloadOnMount);
 const touched=useRef(false),count=useRef(0),mounted=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),delay=useRef(1000);
 const cancelTimer=useCallback(()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}},[]);
 const pause=useCallback(()=>{initial.current=false;touched.current=false;cancelTimer();},[cancelTimer]);
 const schedule=useCallback(function queue(immediate=false){
  cancelTimer();
  if((!touched.current&&!initial.current)||!latest.current.enabled||count.current>=3)return;
  timer.current=setTimeout(()=>{
   timer.current=null;
   if(!mounted.current||(!touched.current&&!initial.current)||!latest.current.enabled||!backgroundSearchAllowed()||count.current>=3)return;
   const onLoad=initial.current&&!touched.current;
   initial.current=false;
   const input=latest.current.read();if(!input)return;
   const attempt=warmBackgroundSearch(input,onLoad);
   if(attempt.started&&!onLoad)count.current++;
   // A queued edit only needs to wait for another edit, never the page preload.
   if(!onLoad&&attempt.busy)void attempt.finished.then(()=>{if(mounted.current&&touched.current)queue(true);});
  },immediate||initial.current?0:delay.current);
 },[cancelTimer]);
 const interact=useCallback((event?:Event)=>{
  if(!latest.current.interactive)return;
  const dateField=event?.target instanceof Element&&Boolean(event.target.closest('.booking-date-input,[type="date"]'));
  delay.current=editingResults&&dateField?400:1000;
  // Text edits already fired input. Their blur-time change may arrive after a
  // destination has warmed, immediately before the traveller submits it.
  const textCommit=event?.type==='change'&&event.target instanceof HTMLInputElement&&['text','search'].includes(event.target.type);
  if(!textCommit)invalidateBackgroundSearch();
  initial.current=false;
  touched.current=true;schedule();
 },[editingResults,schedule]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancelTimer();};},[cancelTimer]);
 useEffect(()=>{
  latest.current={read,enabled:enabled&&!isPending,interactive:enabled};
 },[read,enabled,isPending]);
 useEffect(()=>{
  if(!isPending)syncBackgroundSearchIdentity(owner);
  // Keep an edit queued during destination mapping. Once the resolved IDs
  // are committed we can prepare the listing immediately.
  if(!enabled||isPending)cancelTimer();else schedule(true);
 },[enabled,isPending,owner,schedule,cancelTimer]);
 useEffect(()=>{
  const element=form.current;if(!element)return;
  const clicked=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('.destination-suggestions button,.home-swap,.flight-inline-swap,.flight-inline-journeys button,.multi-city-legs button,.booking-date-input button[data-date]'))interact(event);};
  const observer=new MutationObserver(()=>{if(touched.current)schedule();});
  observer.observe(element,{subtree:true,childList:true,attributes:true,attributeFilter:['value','disabled']});
  const visible=()=>{if(document.visibilityState==='hidden')cancelTimer();else schedule();};
  element.addEventListener('input',interact,true);element.addEventListener('change',interact,true);element.addEventListener('click',clicked,true);document.addEventListener('visibilitychange',visible);
  if(initial.current)schedule(true);
  return()=>{observer.disconnect();element.removeEventListener('input',interact,true);element.removeEventListener('change',interact,true);element.removeEventListener('click',clicked,true);document.removeEventListener('visibilitychange',visible);cancelTimer();};
 },[form,formKey,interact,schedule,cancelTimer]);
 const prepare=useCallback((input:Search|null)=>{
  if(!input||!latest.current.enabled||count.current>=3)return;
  const attempt=warmBackgroundSearch(input);if(attempt.started)count.current++;
 },[]);
 const warmOnSubmit=useCallback((input:Search|null)=>{pause();prepare(input);},[pause,prepare]);
 return {pause,prepare,warmOnSubmit,interact};
}

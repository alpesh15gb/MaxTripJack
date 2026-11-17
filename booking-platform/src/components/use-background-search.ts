'use client';
import {useCallback,useEffect,useRef,type RefObject} from 'react';
import {authClient} from '@/lib/auth-client';
import {backgroundSearchAllowed,invalidateBackgroundSearch,syncBackgroundSearchIdentity,warmBackgroundSearch} from '@/lib/background-search';
import type {Search} from '@/lib/providers/contracts';

/** Quiet speculative work only after a meaningful edit; never supplies UI results. */
export default function useBackgroundSearch({form,read,enabled,formKey=''}:{form:RefObject<HTMLFormElement|null>;read:()=>Search|null;enabled:boolean;formKey?:string}){
 const {data:session,isPending}=authClient.useSession();
 const owner=session?.user.id??'guest';
 const latest=useRef({read,enabled:false,interactive:enabled});
 const touched=useRef(false),count=useRef(0),mounted=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancelTimer=useCallback(()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}},[]);
 const pause=useCallback(()=>{touched.current=false;cancelTimer();},[cancelTimer]);
 const schedule=useCallback(function queue(){
  cancelTimer();
  if(!touched.current||!latest.current.enabled||count.current>=3)return;
  timer.current=setTimeout(()=>{
   timer.current=null;
   if(!mounted.current||!touched.current||!latest.current.enabled||!backgroundSearchAllowed()||count.current>=3)return;
   const input=latest.current.read();if(!input)return;
   const attempt=warmBackgroundSearch(input);
   if(attempt.started)count.current++;
   if(attempt.busy)void attempt.finished.then(()=>{if(mounted.current&&touched.current)queue();});
  },1000);
 },[cancelTimer]);
 const interact=useCallback(()=>{if(!latest.current.interactive)return;touched.current=true;invalidateBackgroundSearch();schedule();},[schedule]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancelTimer();};},[cancelTimer]);
 useEffect(()=>{
  if(!isPending)syncBackgroundSearchIdentity(owner);
  latest.current={read,enabled:enabled&&!isPending,interactive:enabled};
  if(!enabled)pause();else if(isPending)cancelTimer();else if(touched.current)schedule();
 },[read,enabled,isPending,owner,pause,schedule,cancelTimer]);
 useEffect(()=>{
  const element=form.current;if(!element)return;
  const clicked=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('.destination-suggestions button,.home-swap,.multi-city-legs button'))interact();};
  const observer=new MutationObserver(()=>{if(touched.current)schedule();});
  observer.observe(element,{subtree:true,childList:true,attributes:true,attributeFilter:['value','disabled']});
  const visible=()=>{if(document.visibilityState==='hidden')cancelTimer();else if(touched.current)schedule();};
  element.addEventListener('input',interact,true);element.addEventListener('change',interact,true);element.addEventListener('click',clicked,true);document.addEventListener('visibilitychange',visible);
  return()=>{observer.disconnect();element.removeEventListener('input',interact,true);element.removeEventListener('change',interact,true);element.removeEventListener('click',clicked,true);document.removeEventListener('visibilitychange',visible);cancelTimer();};
 },[form,formKey,interact,schedule,cancelTimer]);
 const warmOnSubmit=useCallback((input:Search|null)=>{
  pause();if(!input||!latest.current.enabled||count.current>=3)return;
  const attempt=warmBackgroundSearch(input);if(attempt.started)count.current++;
 },[pause]);
 return {pause,warmOnSubmit,interact};
}

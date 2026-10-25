'use client';
/* eslint-disable @next/next/no-img-element -- Exact-host supplier photos bypass proxies and never send referrers. */
import {useEffect,useRef,useState} from 'react';
import {hotelPhotoCaption,safeHotelPhotoUrl,type HotelPropertyDetails} from '@/lib/hotel-presentation';
import type {HotelMetadataStatus} from './hotel-property-media';

type Props={name:string;photos?:HotelPropertyDetails['photos'];metadataStatus?:HotelMetadataStatus;open:boolean;onOpenChange:(open:boolean)=>void};
export default function HotelGallery({name,photos,metadataStatus='ready',open,onOpenChange}:Props){
 const [failed,setFailed]=useState<string[]>([]),[index,setIndex]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
 const valid=(photos??[]).filter((photo,i,all)=>safeHotelPhotoUrl(photo.url)&&!failed.includes(photo.url)&&all.findIndex(other=>other.url===photo.url)===i).sort((a,b)=>Number(b.isHero)-Number(a.isHero));
 const activeIndex=Math.min(index,Math.max(0,valid.length-1)),active=valid[activeIndex];
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  if(open&&!node.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;node.showModal();}
  if(!open&&node.open){node.close();if(opener.current?.isConnected)opener.current.focus({preventScroll:true});}
 },[open]);
 useEffect(()=>{if(!open)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;};},[open]);
 const fail=(url:string)=>setFailed(current=>current.includes(url)?current:[...current,url]);
 const move=(direction:number)=>setIndex((activeIndex+direction+valid.length)%valid.length);
 const show=(next:number)=>{setIndex(next);onOpenChange(true);};
 const alt=(caption:unknown,i:number)=>hotelPhotoCaption(caption)?`${name} · ${hotelPhotoCaption(caption)}`:`${name} · property photo ${i+1}`;
 return <div className="stay-gallery">
  {valid.length?<div className={`stay-photo-mosaic${valid.length===1?' is-single':valid.length===2?' is-pair':''}`}>
   {valid.slice(0,3).map((photo,i)=><button key={photo.url} type="button" className={`stay-photo-tile tile-${i}`} aria-label={`View photo ${i+1} of ${name}`} onClick={()=>show(i)}><img src={photo.url} alt={alt(photo.caption,i)} width={i===0?900:450} height={i===0?650:320} loading={i===0?'eager':'lazy'} referrerPolicy="no-referrer" onError={()=>fail(photo.url)}/>{i===0&&<span className="stay-photo-source">Supplier property photos</span>}</button>)}
   <button type="button" className="stay-all-photos" onClick={()=>show(0)}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 17 6-6 4 4 3-3 5 5"/><circle cx="16" cy="8" r="1"/></svg>View all {valid.length} photo{valid.length===1?'':'s'}</button>
  </div>:<div className="stay-photo-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M3 21V7l9-4 9 4v14M8 21v-5h8v5M8 8v3m4-4v4m4-3v3"/></svg><strong>{metadataStatus==='loading'?'Property photos are loading':metadataStatus==='unavailable'?'Property photos unavailable right now':'No property photos supplied'}</strong><p>You can still explore the available room options.</p></div>}
  <dialog className="stay-gallery-dialog" ref={dialog} aria-labelledby="stay-gallery-title" onCancel={event=>{event.preventDefault();onOpenChange(false);}} onClick={event=>{if(event.target===event.currentTarget)onOpenChange(false);}} onKeyDown={event=>{if(valid.length>1&&event.key==='ArrowRight'){event.preventDefault();move(1);}if(valid.length>1&&event.key==='ArrowLeft'){event.preventDefault();move(-1);}}}>
   <div className="stay-gallery-shell"><header><div><p>PROPERTY PHOTOS</p><h2 id="stay-gallery-title">{name}</h2></div><button type="button" className="stay-gallery-close" aria-label="Close photo gallery" onClick={()=>onOpenChange(false)} autoFocus><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header>
    {active?<><figure className="stay-gallery-stage"><img src={active.url} alt={alt(active.caption,activeIndex)} width={1200} height={800} referrerPolicy="no-referrer" onError={()=>fail(active.url)}/><figcaption aria-live="polite">{hotelPhotoCaption(active.caption)||'Supplier property photo'} · {activeIndex+1} of {valid.length}</figcaption></figure><nav className="stay-gallery-controls" aria-label="Photo navigation"><button type="button" disabled={valid.length<2} onClick={()=>move(-1)}>Previous photo</button><span aria-hidden="true">{activeIndex+1} / {valid.length}</span><button type="button" disabled={valid.length<2} onClick={()=>move(1)}>Next photo</button></nav><div className="stay-gallery-thumbnails">{valid.map((photo,i)=><button key={photo.url} type="button" aria-label={`Show photo ${i+1}`} aria-pressed={i===activeIndex} onClick={()=>setIndex(i)}><img src={photo.url} alt="" width={100} height={70} loading="lazy" referrerPolicy="no-referrer" onError={()=>fail(photo.url)}/></button>)}</div></>:<p className="stay-gallery-empty" role="status">These photos could not be loaded. Close the gallery to continue exploring the property.</p>}
   </div>
  </dialog>
 </div>;
}

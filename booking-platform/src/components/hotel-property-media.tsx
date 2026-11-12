'use client';
/* eslint-disable @next/next/no-img-element -- Exact-host supplier images deliberately bypass an image proxy; fixed dimensions, lazy loading and no-referrer are required. */
import {useState} from 'react';
import {safeHotelPhotoUrl,hotelPhotoCaption, type HotelPropertyDetails} from '@/lib/hotel-presentation';
export type HotelMetadataStatus='loading'|'unavailable'|'ready';
export default function HotelPropertyMedia({name,photos,gallery=false,metadataStatus='ready',showPhotoCount=false}:{name:string;photos?:HotelPropertyDetails['photos'];gallery?:boolean;metadataStatus?:HotelMetadataStatus;showPhotoCount?:boolean}){
 const [failed,setFailed]=useState<string[]>([]);
 const available=(photos??[]).filter((photo,index,items)=>safeHotelPhotoUrl(photo.url)&&!failed.includes(photo.url)&&items.findIndex(item=>item.url===photo.url)===index).sort((a,b)=>Number(b.isHero)-Number(a.isHero));
 const valid=available.slice(0,gallery?6:1);
 if(!valid.length)return <div className="hotel-photo-unavailable">{metadataStatus==='loading'?'Property photos loading…':metadataStatus==='unavailable'?'Property photos unavailable right now':'Property photos not available'}</div>;
 return <div className={gallery?'hotel-property-gallery':'hotel-property-thumb'}>{valid.map((photo,index)=>{const caption=hotelPhotoCaption(photo.caption);return <figure key={photo.url}>{/* Exact supplier-host URLs are allowlisted server-side and again here. No optimizer/proxy or referrer. */}<img src={photo.url} alt={caption?`${name} · ${caption}`:`${name} · supplier property photo ${index+1}`} loading="lazy" referrerPolicy="no-referrer" width={gallery?480:220} height={gallery?320:240} onError={()=>setFailed(current=>[...current,photo.url])}/>{gallery&&caption&&<figcaption>{caption}</figcaption>}</figure>;})}{showPhotoCount&&!gallery&&<span className="hotel-photo-count">{available.length} photo{available.length===1?'':'s'}</span>}</div>;
}

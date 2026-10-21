'use client';
/* eslint-disable @next/next/no-img-element -- Exact-host supplier images deliberately bypass an image proxy; fixed dimensions, lazy loading and no-referrer are required. */
import {useState} from 'react';
import type {HotelPropertyDetails} from '@/lib/hotel-presentation';
export default function HotelPropertyMedia({name,photos,gallery=false}:{name:string;photos?:HotelPropertyDetails['photos'];gallery?:boolean}){
 const [failed,setFailed]=useState<string[]>([]);
 const valid=(photos??[]).filter(photo=>{try{const url=new URL(photo.url);return url.protocol==='https:'&&url.hostname==='pix8.agoda.net'&&url.pathname.startsWith('/hotelImages/')&&!url.username&&!url.password&&!url.port&&!failed.includes(photo.url);}catch{return false;}}).slice(0,gallery?6:1);
 if(!valid.length)return <div className="hotel-photo-unavailable">Property photos not available</div>;
 return <div className={gallery?'hotel-property-gallery':'hotel-property-thumb'}>{valid.map((photo,index)=><figure key={photo.url}>{/* Exact supplier-host URLs are allowlisted server-side and again here. No optimizer/proxy or referrer. */}<img src={photo.url} alt={photo.caption?`${name} · ${photo.caption}`:`${name} · supplier property photo ${index+1}`} loading="lazy" referrerPolicy="no-referrer" width={gallery?480:220} height={gallery?320:240} onError={()=>setFailed(current=>[...current,photo.url])}/>{gallery&&photo.caption&&<figcaption>{photo.caption}</figcaption>}</figure>)}</div>;
}

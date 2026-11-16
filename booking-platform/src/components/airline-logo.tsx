"use client";
import Image from 'next/image';
import { useState } from 'react';
import { airlineLogo } from '@/lib/airline-logo';
export default function AirlineLogo({code,name}:{code?:string;name?:string}){
 const src=airlineLogo(code,name),[failed,setFailed]=useState<string|null>(null);
 return <span className="airline-monogram airline-logo" aria-hidden="true" style={{background:'#fff',padding:5,flexShrink:0}}>
  {src&&failed!==src?<Image src={src} alt="" width={32} height={32} unoptimized style={{width:'100%',height:'100%',objectFit:'contain'}} onError={()=>setFailed(src)}/>:<span>{code?.trim().toUpperCase().slice(0,3)||'✈'}</span>}
 </span>;
}

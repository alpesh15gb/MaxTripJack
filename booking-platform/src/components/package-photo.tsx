"use client";
import {useState} from 'react';
import {packageMediaPath} from '@/lib/package-media';
import {safePackagePhoto} from '@/lib/travel-packages';
import {TravelIcon} from './travel-shell';
export function PackagePhoto({url,alt}: {url:string;alt:string}) {
  const [failed,setFailed] = useState(false);
  const src=safePackagePhoto(url)?packageMediaPath(url)||url:null;
  // Approved CDN URLs render directly; exact public asset IDs use the bounded fixed-CRM bridge.
  // eslint-disable-next-line @next/next/no-img-element
  return src && !failed ? <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className="package-photo-empty"><TravelIcon name="globe" size={32}/><span>Package photos not available</span></div>;
}

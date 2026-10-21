"use client";
import {useState} from 'react';
import {TravelIcon} from './travel-shell';
export function PackagePhoto({url,alt}: {url:string;alt:string}) {
  const [failed,setFailed] = useState(false);
  // URL has passed the shared strict image allowlist; no server proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return url && !failed ? <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className="package-photo-empty"><TravelIcon name="globe" size={32}/><span>Package photos not available</span></div>;
}

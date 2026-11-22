"use client";
import Link from 'next/link';
import {packageDurationLabel} from '@/lib/package-duration';
import {PackagePhoto} from './package-photo';
import {useEffect,useState} from 'react';
import {currentPackageSummary,packagePrice,packagePriceBasis,type TravelPackageSummary} from '@/lib/travel-packages';
import {TravelIcon} from './travel-shell';
import {HomeDisclosure} from './home-disclosure';
export function HomePackages(){
 const [planningOnly,setPlanningOnly]=useState(false);
 const [items,setItems]=useState<TravelPackageSummary[]|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/packages',{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('unavailable');const data=await response.json();if(!Array.isArray(data.packages))throw new Error('shape');if(!data.packages.length&&(data.truncated||data.unavailableCount>0))throw new Error('partial');setPlanningOnly(data.source==='trip-ideas');setItems(data.packages.slice(0,3).map((p:unknown)=>currentPackageSummary(p)));}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});return()=>controller.abort();},[]);
 return <section className="home-package-plans" aria-labelledby="home-packages-title"><div className="stitch-package-intro"><h2 id="home-packages-title">Holiday packages</h2><p>Custom itineraries from our team, planned around your dates, interests and group.</p><div><Link href="/packages">Explore travel packages <TravelIcon name="arrow" size={16}/></Link><Link href="/contact">Talk to Max Travel</Link></div></div>{items?.length ? <HomeDisclosure className="stitch-package-list" title={planningOnly?`View ${items.length} trip ideas`:`View ${items.length} published ${items.length===1?"itinerary":"itineraries"}`}><div className="home-package-grid">{items.map(p=><Link key={p.id} href={`/packages/${p.slug}`}>{p.coverImageUrl && <div className="home-package-photo"><PackagePhoto url={p.coverImageUrl} alt={p.coverImageAlt || p.title}/></div>}<span>{p.destination} · {packageDurationLabel(p.durationDays,'day')}</span><h3>{p.title}</h3><p>{p.summary}</p><strong>{p.priceAmount!==null?'Starting estimate · ':''}{packagePrice(p)}</strong><small>{packagePriceBasis[p.priceBasis]} · {p.availability==='UNAVAILABLE'?'Currently unavailable':'Dates & availability on request'}</small><span className="home-package-detail">View itinerary <TravelIcon name="arrow" size={16}/></span></Link>)}</div></HomeDisclosure>:failed?<p className="home-package-note">Published packages are temporarily unavailable. Our team can still help with your trip.</p>:null}<p className="home-package-note">Enquiries only. Our team confirms the final quote and availability for your group.</p></section>;
}

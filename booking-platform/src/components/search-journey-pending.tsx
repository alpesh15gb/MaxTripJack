"use client";
import {useEffect,useState} from 'react';

export type PendingSearch = { title: string; detail: string; phase: 'destination' | 'availability' };

/** The status follows actual requests. A long wait adds an editing option, never an ETA. */
export default function SearchJourneyPending({product,context,onStop}:{product:'FLIGHT'|'HOTEL';context:PendingSearch|null;onStop:()=>void}){
 const [takingLonger,setTakingLonger]=useState(false);
 useEffect(()=>{
  const timer=window.setTimeout(()=>setTakingLonger(true),6000);
  return()=>window.clearTimeout(timer);
 },[]);
 const mapping=context?.phase==='destination';
 const status=mapping?'Finding properties in this destination…':product==='FLIGHT'?'Checking flight availability…':'Checking hotel availability…';
 const [from,to]=product==='FLIGHT'&&context?.title.includes('→')&&!context.title.includes('·')?context.title.split('→').map(part=>part.trim()):['',''];
 return <section id="booking-pending" className="booking-pending journey-search-scene" aria-label="Search in progress">
  <div className="journey-search-art" aria-hidden="true"><svg viewBox="0 0 360 120" focusable="false"><circle className="journey-cloud journey-cloud-a" cx="90" cy="30" r="9"/><circle className="journey-cloud journey-cloud-a" cx="102" cy="30" r="12"/><circle className="journey-cloud journey-cloud-b" cx="262" cy="22" r="8"/><circle className="journey-cloud journey-cloud-b" cx="273" cy="22" r="11"/><path className="journey-search-route" d="M40 85 Q180 5 320 85" fill="none"/>{product==='FLIGHT'&&<path className="journey-search-trail" d="M40 85 Q180 5 320 85" fill="none" pathLength="100"/>}<circle cx="40" cy="85" r="5"/><circle cx="320" cy="85" r="5"/>{from&&to&&<><text className="journey-search-code" x="40" y="108" textAnchor="middle">{from.replace(/^.*\(|\)$/g,'').slice(0,4)}</text><text className="journey-search-code" x="320" y="108" textAnchor="middle">{to.replace(/^.*\(|\)$/g,'').slice(0,4)}</text></>}{product==='FLIGHT'?<g className="journey-search-plane"><path d="m-13 2 10-4-1-10 4-1 4 10 10 4v3L3 3l-4 9-3-1 1-9-10 3z"/></g>:<g className="journey-search-stay"><circle cx="180" cy="52" r="29"/><path d="m163 51 17-14 17 14v21h-34zM176 72V56h8v16"/><circle className="journey-stay-glow" cx="180" cy="52" r="29"/></g>}</svg></div>
  <div className="journey-search-copy">
   <h2>{context?.title||(product==='FLIGHT'?'Flight search':'Hotel search')}</h2>
   {context?.detail&&<p className="journey-search-criteria">{context.detail}</p>}
   <div role="status" aria-live="polite" aria-label="Search and booking activity">
    <strong>{status}</strong>
    <p>{mapping?'We’ll check rates for your dates once we have the matching properties.':'Waiting for live supplier availability. Results will appear as soon as they arrive.'}</p>
    {takingLonger&&<p className="journey-search-delay">The search is still running. You can keep waiting or edit your search.</p>}
   </div>
   <button type="button" className="secondary" onClick={onStop}>Stop search & edit</button>
  </div>
  <div className="journey-search-skeletons" aria-hidden="true">{[0,1,2].map(i=><div className="journey-skeleton-card" key={i}><span className="sk sk-badge"/><span className="sk sk-line sk-wide"/><span className="sk sk-line"/><span className="sk sk-price"/></div>)}</div>
 </section>;
}

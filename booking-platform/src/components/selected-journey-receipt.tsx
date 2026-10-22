import type {ReactNode} from 'react';
import type {Flight} from '@/lib/booking-presentation';
import {displayMoney} from '@/lib/display-money';
/** Reviewed total comes only from the quote. Children retain original search estimates. */
export default function SelectedJourneyReceipt({flights,totalMinor,hotel,children}:{flights:Flight[];totalMinor:number;hotel?:{name:string;room:string;meal:string;cancellation:string};children:ReactNode}){
 return <section className="selected-itinerary compact-selected-itinerary" aria-label="Selected itinerary"><div className="selected-journey-recap"><div>{hotel?<><strong>{hotel.name}</strong><p>{hotel.room} · {hotel.meal}</p><p>{hotel.cancellation}</p></>:<ul>{flights.flatMap((flight,index)=>flight.sI.map((segment,part)=><li key={`${index}-${part}`}><strong>{segment.da.code} → {segment.aa.code} · {segment.dt.slice(11,16)}–{segment.at.slice(11,16)}</strong><span>{segment.fD.aI.name} · {segment.dt.slice(0,10)}{segment.at.slice(0,10)!==segment.dt.slice(0,10)?` → ${segment.at.slice(0,10)}`:''}</span></li>))}</ul>}</div><div className="selected-reviewed-total"><span>Reviewed total</span><strong>{displayMoney(totalMinor)}</strong><small>For all selected travellers{hotel?' and rooms':''}</small></div></div><details className="selected-source-details"><summary>Original search details & fare</summary>{children}</details></section>;
}

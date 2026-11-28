'use client';

import {useState} from 'react';
import CancellationProgress from './cancellation-progress';
import CancellationRequest from './cancellation-request';
import FlightServices from './flight-services';
import {TravelIcon} from './travel-icon';

export default function TripManagement({bookingId,product,status,serviceKind,onUpdate}: {
  bookingId:string; product:string; status:string; serviceKind?:string|null; onUpdate:()=>void;
}) {
  const [opened,setOpened] = useState(false);
  const [revision,setRevision] = useState(0);
  const canRequest = serviceKind !== 'ANCILLARY' && ['CONFIRMED','TICKETED'].includes(status);
  const canChangeFlight = product === 'FLIGHT' && status === 'TICKETED' && serviceKind !== 'ANCILLARY';
  return <details className="trip-management" onToggle={event=>{if(event.currentTarget.open)setOpened(true);}}>
    <summary><span className="private-management-title"><TravelIcon name="refresh" size={18}/><span>Changes, cancellation &amp; refund updates</span></span><TravelIcon name="chevron" size={16}/></summary>
    {opened&&<div>
      {canRequest&&<CancellationRequest bookingId={bookingId} product={product} onSubmitted={()=>setRevision(value=>value+1)}/>}
      {canChangeFlight&&<FlightServices bookingId={bookingId} onUpdate={onUpdate}/>}
      <CancellationProgress bookingId={bookingId} refreshVersion={revision}/>
    </div>}
  </details>;
}

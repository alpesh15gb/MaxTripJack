import {hotelRoomLabel,hotelCancellationLabel,type HotelPropertyDetails,type HotelRoomOption} from '@/lib/hotel-presentation';
import {stayNights,type HotelStayContext} from '@/lib/hotel-results';
import {travelDateLabel} from '@/lib/travel-date';
import HotelPropertyMedia from './hotel-property-media';
import HotelCancellationTimeline from './hotel-cancellation-timeline';
import {money} from './booking-flight-card';

export type AvailableHotelOption={roomInfo?:HotelRoomOption['roomInfo'];inclusions?:string[];optionType?:string;optionId:string;mealBasis?:string;pricing:{totalPrice:number;mf?:number;mft?:number};cancellation?:unknown;bookingNotes?:string};
export default function HotelRoomView({name,options,property,context,busy,now,checkingOptionId,selectedOptionId,onBack,onReview}:{name:string;options:AvailableHotelOption[];property?:HotelPropertyDetails;context:HotelStayContext|null;busy:boolean;now:number|null;checkingOptionId?:string;selectedOptionId?:string;onBack:()=>void;onReview:(optionId:string)=>void}){
 const nights=stayNights(context);
 return <section id="booking-rooms" className="booking-rooms room-workspace" aria-label="Room options">
  <button type="button" className="secondary room-back" disabled={busy} onClick={onBack}><span aria-hidden="true">← </span>Back to stays</button>
  <header className="room-workspace-heading"><div><h2 id="room-choice-title" tabIndex={-1}>Choose your room</h2><h3>{name}</h3>{context&&<><p className="room-stay-context">{nights?`${nights} night${nights===1?'':'s'} · `:''}{context.rooms} room{context.rooms===1?'':'s'} · {context.guests} guest{context.guests===1?'':'s'}</p><p className="room-stay-dates">{travelDateLabel(context.checkIn)} – {travelDateLabel(context.checkOut)}</p></>}</div>{Boolean(property?.photos?.length)&&<div className="room-property-photo"><HotelPropertyMedia name={name} photos={property?.photos}/></div>}</header>
  {Boolean(property?.address||property?.photos?.length)&&<details className="room-gallery"><summary>Property details{property?.photos?.length?' & photos':''}</summary>{property?.address&&<p>{property.address}</p>}<HotelPropertyMedia name={name} photos={property?.photos} gallery/></details>}
  <div className="room-choice-intro"><p>Compare the room, meal plan and cancellation terms. Nothing is reserved yet.</p></div>
  {options.length?<div className="room-option-list">{options.map(option=>{
   const checking=busy&&checkingOptionId===option.optionId,selected=selectedOptionId===option.optionId;
   const total=option.pricing?.totalPrice,minor=typeof total==='number'&&Number.isFinite(total)&&total>0?Math.round(total*100):NaN;
   return <article className={`live-fare room-option-card${selected?' is-selected':''}`} key={option.optionId}>
    <div className="room-option-info">{selected&&<span className="room-selection-label">Selected room rate</span>}<h3>{hotelRoomLabel({roomInfo:option.roomInfo??[]})}</h3><dl className="room-choice-facts"><div><dt>Meals</dt><dd>{option.mealBasis?.replaceAll('_',' ')||'Meal plan not supplied'}</dd></div><div><dt>Cancellation</dt><dd>{hotelCancellationLabel(option.cancellation,now??undefined)}</dd></div></dl>{option.bookingNotes&&<p>{option.bookingNotes}</p>}</div>
    <div className="room-option-action"><small>Estimated full stay total</small><strong>{money(minor)}</strong><p>All selected rooms and guests · final total at review</p>{checking&&<p className="booking-selection-status" role="status">Checking current room price and terms… Your stay is not reserved yet.</p>}<button type="button" className="primary" disabled={busy} aria-pressed={selected} onClick={()=>onReview(option.optionId)}>{checking?'Checking room…':'Review stay'}</button></div>
    <details className="room-option-details"><summary>Full cancellation policy & room details</summary><HotelCancellationTimeline value={option.cancellation}/>{Boolean(option.inclusions?.length)&&<ul className="fare-features">{option.inclusions?.map(item=><li key={item}>{item}</li>)}</ul>}</details>
   </article>;
  })}</div>:<div className="empty-results"><h3>No rooms available</h3><p>Return to your stays to choose another property. Your filters and search are kept.</p></div>}
 </section>;
}

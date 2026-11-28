'use client';
import {useEffect,useRef,useState,type MouseEvent} from 'react';
import '@/app/hotel-detail.css';
import {hotelRoomLabel,hotelCancellationLabel,type HotelPropertyDetails} from '@/lib/hotel-presentation';
import {stayNights,type HotelStayContext} from '@/lib/hotel-results';
import {travelDateLabel} from '@/lib/travel-date';
import HotelGallery from './hotel-gallery';
import type {HotelMetadataStatus} from './hotel-property-media';
import type {AvailableHotelOption} from './hotel-room-view';
import HotelCancellationTimeline from './hotel-cancellation-timeline';
import {money} from './booking-flight-card';
import {bookingPriceLines} from '@/lib/booking-price-breakdown';
import HotelRoomFilters from './hotel-room-filters';
import {StitchSymbol} from './stitch-symbol';
import {TravelIcon} from './travel-icon';
import {filterRoomPlans,hasFreeCancellation,roomMealLabel,type RoomPlanFilters} from '@/lib/hotel-room-filters';

export type HotelDetailViewProps={name:string;property?:HotelPropertyDetails;metadataStatus?:HotelMetadataStatus;context:HotelStayContext|null;options:AvailableHotelOption[];roomsStatus:'loading'|'ready'|'error';roomsError?:string;busy:boolean;now:number|null;checkingOptionId?:string;selectedOptionId?:string;onBack:()=>void;onRetry:()=>void;onEditSearch?:()=>void;onReview:(optionId:string)=>void;galleryOpen?:boolean;onGalleryChange?:(open:boolean)=>void};
function optionTotal(option:AvailableHotelOption){const value=option.pricing?.totalPrice;return typeof value==='number'&&Number.isFinite(value)&&value>0&&Number.isSafeInteger(Math.round(value*100))?Math.round(value*100):null;}
/** Every summary is derived from the same eligible options as the rate rows. */
export function hotelRoomRateSummary(options:AvailableHotelOption[],filters:RoomPlanFilters,now:number|null){
 const filteredOptions=filterRoomPlans(options,filters,now);
 const priced=filteredOptions.flatMap(option=>{const total=optionTotal(option);return total===null?[]:[{option,total}];}).sort((a,b)=>a.total-b.total);
 return {filteredOptions,lowest:priced[0]};
}
/** Rate groups are display-only. Exact option IDs remain the unit of review. */
export function groupHotelRoomRates(options:AvailableHotelOption[]){
 const groups=new Map<string,{key:string;label:string;options:AvailableHotelOption[]}>();
 for(const option of options){
  const rooms=option.roomInfo;
  const known=Boolean(rooms?.length&&rooms.every(room=>typeof room.name==='string'&&room.name.trim()));
  const key=known?`rooms:${JSON.stringify(rooms!.map(room=>[room.id??null,room.name]))}`:`unknown:${option.optionId}`;
  const group=groups.get(key)??{key,label:hotelRoomLabel({roomInfo:rooms??[]}),options:[]};group.options.push(option);groups.set(key,group);
 }
 // Keep the entire room bundle together. Within each group, put rates that can
 // be reviewed first, retaining supplier order for ties and unknown prices.
 function byPrice(a:AvailableHotelOption,b:AvailableHotelOption){
  const left=optionTotal(a),right=optionTotal(b);
  if(left===right)return 0;
  if(left===null)return 1;
  if(right===null)return -1;
  return left-right;
 }
 const ordered=[...groups.values()];
 for(const group of ordered)group.options.sort(byPrice);
 return ordered.sort((a,b)=>byPrice(a.options[0],b.options[0]));
}
/** Collapse formatting duplicates without turning supplier restrictions into benefits. */
function distinctPropertyAmenities(values:string[]=[]){
 const seen=new Set<string>();
 return values.map(value=>value.trim()).filter(value=>{
  const key=value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  if(!key||seen.has(key))return false;
  seen.add(key);return true;
 });
}
export default function HotelDetailView({name,property,metadataStatus='ready',context,options,roomsStatus,roomsError,busy,now,checkingOptionId,selectedOptionId,onBack,onRetry,onEditSearch,onReview,galleryOpen,onGalleryChange}:HotelDetailViewProps){
 const [localGallery,setLocalGallery]=useState(false),[mobileActionVisible,setMobileActionVisible]=useState(false);
 const [currentSection,setCurrentSection]=useState('hotel-room-options-title');
 const detailRoot=useRef<HTMLElement>(null),detailEnd=useRef<HTMLDivElement>(null),roomSection=useRef<HTMLElement>(null);
 const pendingRateStatus=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{
  if (!busy || !checkingOptionId) return;
  // The pending line appears below the rate button and may extend past the viewport.
  pendingRateStatus.current?.scrollIntoView({block:'nearest',behavior:'instant'});
 },[busy,checkingOptionId]);
 useEffect(()=>{
  const root=detailRoot.current,end=detailEnd.current,rooms=roomSection.current;if(!root||!end||!rooms||typeof IntersectionObserver==='undefined')return;
  let visible=false,atEnd=false,atRooms=false;
  const updateShortcut=()=>setMobileActionVisible(visible&&!atEnd&&!atRooms);
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){if(entry.target===root)visible=entry.isIntersecting;if(entry.target===end)atEnd=entry.isIntersecting;}
   updateShortcut();
  },{rootMargin:'0px 0px 90px 0px'});
  observer.observe(root);observer.observe(end);
  let roomObserver:IntersectionObserver|undefined;
  const observeRooms=()=>{
   roomObserver?.disconnect();
   // A heading entering the bottom of the viewport leaves room actions out of reach.
   roomObserver=new IntersectionObserver(([entry])=>{atRooms=entry.isIntersecting;updateShortcut();},
    {rootMargin:`0px 0px -${Math.round(window.innerHeight*.44)}px 0px`});
   roomObserver.observe(rooms);
  };
  observeRooms();
  window.addEventListener('resize',observeRooms);
  return()=>{observer.disconnect();roomObserver?.disconnect();window.removeEventListener('resize',observeRooms);};
 },[]);
 const [rateFilters,setRateFilters]=useState({breakfast:false,freeCancellation:false});
 const [comparisonId,setComparisonId]=useState(selectedOptionId??'');
 const {filteredOptions,lowest}=hotelRoomRateSummary(options,rateFilters,now);
 const comparison=filteredOptions.find(option=>option.optionId===comparisonId);
 const comparisonTotal=comparison?optionTotal(comparison):null;
 const comparedRate=comparison&&comparisonTotal!==null?{option:comparison,total:comparisonTotal}:null;
 const currentRate=roomsStatus==='ready'?(comparedRate??lowest):undefined;
 const summaryPriceLabel=comparedRate?(comparisonId===selectedOptionId?'Selected full stay estimate':'Compared full stay total'):'Estimated full stay total from';
 const filtersActive=rateFilters.breakfast||rateFilters.freeCancellation;
 const noMatchingRates=roomsStatus==='ready'&&options.length>0&&!filteredOptions.length;
 const noPrices=roomsStatus==='ready'&&filteredOptions.length>0&&!lowest;
 const canClearRates=noMatchingRates||(noPrices&&filtersActive&&options.some(option=>optionTotal(option)!==null));
 const stayUnavailable=roomsStatus==='ready'&&!lowest&&!canClearRates;
 const clearRateFilters=()=>{setRateFilters({breakfast:false,freeCancellation:false});showRooms();};
 const groups=groupHotelRoomRates(filteredOptions);
 const amenities=distinctPropertyAmenities(property?.amenities);
 const nights=stayNights(context);
 const guestLabel=context?`${context.rooms} room${context.rooms===1?'':'s'} · ${context.guests} guest${context.guests===1?'':'s'}`:null;
 const stayLabel=context?`${nights?`${nights} night${nights===1?'':'s'} · `:''}${context.rooms} room${context.rooms===1?'':'s'} · ${context.guests} guest${context.guests===1?'':'s'}`:'All selected rooms and guests';
 const nightlyScope=context&&context.rooms>1?'average per night across all rooms':'average per night';
 const location=property?.address||property?.city;
 const sections=[
  ['hotel-room-options-title','Rooms & rates'],
  ['stay-about-title','About this stay'],
  ['stay-amenities-title','Amenities'],
  ...(location?[['stay-location-title','Location']]:[]),
  ['stay-overview','Overview & photos'],
 ];
 const scrollToSection=(id:string)=>{
  const target=document.getElementById(id);
  target?.focus({preventScroll:true});
  target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 };
 const showRooms=()=>{setCurrentSection('hotel-room-options-title');scrollToSection('hotel-room-options-title');};
 const followSection=(event:MouseEvent<HTMLAnchorElement>,id:string)=>{
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  setCurrentSection(id);
  scrollToSection(id);
 };
 const otherDatesLabel=onEditSearch?'Change stay dates':'Browse other stays';
 const roomAction=canClearRates?clearRateFilters:stayUnavailable?(onEditSearch??onBack):showRooms;
 const roomActionLabel=canClearRates?'Show all rates':stayUnavailable?otherDatesLabel:roomsStatus==='ready'?'Choose room':'View room availability';
 const previewActionLabel=roomsStatus==='ready'&&lowest? `View ${filteredOptions.length} room rate${filteredOptions.length===1?'':'s'}`:roomActionLabel;
 return <section ref={detailRoot} id="booking-rooms" className="stay-detail stay-rate-comparison hotel-reference-detail" aria-label={`${name} property details`}>
  <nav className="stay-breadcrumb" aria-label="Property breadcrumb"><button type="button" disabled={busy} onClick={onBack}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg>Back to stays</button><span aria-hidden="true">/</span><span aria-current="page">{name}</span></nav>
  <header className="stay-detail-heading"><div className="stay-heading-copy">
   <div className="stay-heading-title"><h2 id="hotel-detail-title" tabIndex={-1}>{name}</h2>
    {property?.starRating?<span className="stay-category"><span className="stay-stars" aria-hidden="true">{Array.from({length:property.starRating},(_,index)=><svg key={index} width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1Z"/></svg>)}</span><span className="sr-only">{property.starRating}-star property category</span></span>:<span className="sr-only">{metadataStatus==='loading'?'Property details loading…':metadataStatus==='unavailable'?'Property category unavailable right now':'Property category not supplied'}</span>}
   </div>
   <div className="stay-heading-meta"><p className="stay-address"><TravelIcon name="pin" size={15}/>{location||(metadataStatus==='loading'?'Loading the property address…':metadataStatus==='unavailable'?'Property address unavailable right now':'Property address not supplied')}</p>{property?.propertyType&&<span className="stay-property-tag">{property.propertyType}</span>}</div>
  </div>
   <button type="button" className="secondary stay-heading-cta" disabled={busy} onClick={roomAction}>{roomActionLabel}</button>
  </header>
  <div id="stay-overview" tabIndex={-1} className="stay-overview-main"><HotelGallery name={name} photos={property?.photos} metadataStatus={metadataStatus} open={galleryOpen??localGallery} onOpenChange={onGalleryChange??setLocalGallery} expandedMosaic/></div>
  {amenities.length>0&&<ul className="stay-overview-amenities" aria-label="Property highlights">{amenities.slice(0,6).map(item=><li key={item}><TravelIcon name="check" size={15}/>{item}</li>)}</ul>}
  <nav className="stay-section-nav" aria-label="Property sections">
   {sections.map(([id,label])=><a key={id} href={`#${id}`} aria-current={currentSection===id?'location':undefined} onClick={event=>followSection(event,id)}>{label}</a>)}
  </nav>
  <div className="stay-room-layout">
  <section ref={roomSection} id="hotel-room-options" className="stay-rooms-section" aria-labelledby="hotel-room-options-title">
   <header><div>
    <a className="stay-room-property-link" href="#hotel-detail-title" onClick={event=>followSection(event,'hotel-detail-title')}>{name} <span aria-hidden="true">↑</span></a>
    <h2 id="hotel-room-options-title" tabIndex={-1}>Choose your room</h2>
    <p>{context&&<>{travelDateLabel(context.checkIn)} – {travelDateLabel(context.checkOut)} · </>}{stayLabel}</p>
   </div>{roomsStatus==='ready'&&options.length>0&&<span className="stay-rate-count" role="status">{filtersActive?`${filteredOptions.length} of ${options.length} rates match`:`${options.length} rate option${options.length===1?'':'s'}`}</span>}</header>
   {roomsStatus==='ready'&&options.length>0&&<HotelRoomFilters options={options} filters={rateFilters} now={now} onChange={setRateFilters}/>}
   {roomsStatus==='ready'&&!lowest&&<div className="stay-room-state">
    <h3>{noMatchingRates?'No rates match these preferences':noPrices?'Room prices aren’t available':'No rooms available for this stay'}</h3>
    <p role="status">{canClearRates?'Show all room rates for these dates, or adjust your rate preferences.':noPrices?'A bookable total is unavailable for these rooms. Check the prices again or change your dates.':'Change your dates or look at the other properties in your search.'}</p>
    <div className="stay-room-recovery-actions">
     {canClearRates?<button type="button" className="primary" disabled={busy} onClick={clearRateFilters}>Show all rates</button>:<>
      {noPrices&&<button type="button" className="primary" disabled={busy} onClick={()=>{showRooms();onRetry();}}>Retry room availability</button>}
      {onEditSearch&&<button type="button" className={noPrices?'secondary':'primary'} disabled={busy} onClick={onEditSearch}>Change stay dates</button>}
      <button type="button" className="secondary" disabled={busy} onClick={onBack}>Browse other stays</button>
     </>}
    </div>
   </div>}
   {roomsStatus==='loading'&&<div className="stay-room-state" role="status"><h3>Checking available rooms</h3><p>We’re looking up rates for your exact dates and guests. You can keep exploring the property above.</p><div className="booking-loading-lines" aria-hidden="true"><i/><i/><i/></div></div>}
   {roomsStatus==='error'&&<div className="stay-room-state stay-room-error" role="alert">
    <h3>We couldn’t load the room options</h3>
    <p>{roomsError||'Please try again. Your search and property details are kept.'}</p>
    <div className="stay-room-recovery-actions">
     <button type="button" className="primary" disabled={busy} onClick={()=>{showRooms();onRetry();}}>Retry room availability</button>
     <button type="button" className="secondary" disabled={busy} onClick={onBack}>Browse other stays</button>
    </div>
   </div>}
   {roomsStatus==='ready'&&groups.length>0&&<div className="stay-room-groups">{groups.map((group,groupIndex)=>{
    const groupId=`stay-room-group-${groupIndex}`;
    const pricedPlans=group.options.flatMap((option,index)=>{
     const total=optionTotal(option);
     return total===null?[]:[{option,index,total}];
    });
    const groupComparison=pricedPlans.find(({option})=>option.optionId===comparisonId);
    const priceIncrease=groupComparison?groupComparison.total-pricedPlans[0].total:0;
    return <section className="stay-room-group" key={group.key} data-room-group={groupIndex} aria-label={`Room combination ${groupIndex+1}: ${group.label}`}>
     <header className="stay-room-group-heading">
      <div className="stay-room-group-title"><TravelIcon name="bed" size={23}/><div><h3 id={groupId}>{group.label}</h3>{guestLabel&&<p><TravelIcon name="user" size={15}/>{guestLabel}</p>}</div></div>
      <span>{group.options.length} rate plan{group.options.length===1?'':'s'}</span>
     </header>
     {pricedPlans.length>1&&<div className="stay-room-compare">
      <label><span>Compare rate plans</span>
       <select aria-label={`Compare rates for ${group.label}`} value={groupComparison?.option.optionId??''} disabled={busy} onChange={event=>setComparisonId(event.target.value)}>
        <option value="">Choose a rate to compare</option>
        {pricedPlans.map(({option,index,total})=><option key={option.optionId} value={option.optionId}>{`Rate ${index+1}: ${roomMealLabel(option)} · ${hotelCancellationLabel(option.cancellation,now??NaN)} · ${money(total)}`}</option>)}
       </select>
      </label>
      {groupComparison&&<p role="status"><strong>{money(groupComparison.total)} for the full stay</strong>{priceIncrease>0&&<span>{money(priceIncrease)} more than the lowest rate for this room choice</span>}</p>}
     </div>}
     <div className="stay-room-rates">{group.options.map((option,index)=>{
      const total=optionTotal(option),selected=selectedOptionId===option.optionId,checking=busy&&checkingOptionId===option.optionId;
      const comparing=comparedRate?.option.optionId===option.optionId;
      const planId=`${groupId}-plan-${index}`;
      const freeCancellation=hasFreeCancellation(option,now);
      const cancellation=hotelCancellationLabel(option.cancellation,now??NaN);
      const mealLabel=roomMealLabel(option);
      const inclusions=option.inclusions?.filter(item=>{
       const text=item.trim().toLowerCase();
       const repeatsBreakfast=mealLabel==='Breakfast included'&&/^(?:(?:complimentary|free|daily) )?breakfast(?: included)?$/.test(text);
       return text!==mealLabel.toLowerCase()&&!repeatsBreakfast;
      });
      return <article className={`room-option-card stay-room-rate${selected?' is-selected':''}${comparing?' is-compared':''}`} key={option.optionId} data-room-option-id={option.optionId} aria-label={`Rate ${index+1}: ${group.label}`} aria-describedby={planId}>
       <div className="stay-room-rate-main">
        {(selected||comparing)&&<span className="room-selection-label">{selected?'Selected room rate':'Rate being compared'}</span>}
        <div className="stay-rate-choices">
         <div><span className="stay-choice-label"><TravelIcon name="shield" size={15}/> Cancellation</span><p className="stay-rate-cancellation" data-free={freeCancellation} id={`${planId}-terms`}>{cancellation}</p></div>
         <div><span className="stay-choice-label"><StitchSymbol name="restaurant" size={15}/> Meals</span><h4 className="stay-plan-title" id={planId}>{mealLabel}</h4></div>
        </div>
        {Boolean(inclusions?.length)&&<ul className="stay-rate-inclusions">{inclusions?.map((item,i)=><li key={`${item}-${i}`}>{item}</li>)}</ul>}
       </div>
       <div className="room-option-action stay-room-rate-action">
        <div className="stay-rate-total"><small>Estimated full stay total</small><strong id={`${planId}-price`}>{total===null?'Price unavailable':money(total)}</strong><p>{stayLabel}</p></div>
        {total!==null&&nights&&nights>1&&<small className="stay-rate-nightly">{money(Math.round(total/nights))} {nightlyScope}</small>}
        <button type="button" className="primary" aria-describedby={`${groupId} ${planId} ${planId}-terms ${planId}-price`} disabled={busy||total===null} onClick={()=>{setComparisonId(option.optionId);onReview(option.optionId);}}>{checking?'Checking your room…':'Continue with room'}</button>
        {checking&&<p ref={pendingRateStatus} role="status">Checking your selected room rate. Nothing is reserved yet.</p>}
       </div>
       <details className="stay-room-conditions"><summary>Full cancellation policy & room details</summary>{option.priceBreakdown&&<section><h5>Estimated price breakdown</h5><dl className="stay-preview-facts">{bookingPriceLines('HOTEL',option.priceBreakdown).map(([label,amount])=><div key={label}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl></section>}<HotelCancellationTimeline value={option.cancellation}/>{option.bookingNotes&&<section><h5>Property instructions</h5><p className="stay-booking-notes">{option.bookingNotes}</p></section>}</details>
      </article>;
     })}</div>
    </section>;
   })}</div>}
  </section>
   <aside className="stay-rate-preview" aria-label="Stay price summary">
    {currentRate?<div className="stay-preview-price"><small>{summaryPriceLabel}</small><strong>{money(currentRate.total)}</strong><span>{stayLabel}</span>{nights&&nights>1&&<span>{money(Math.round(currentRate.total/nights))} {nightlyScope}</span>}</div>:<h3>Room availability</h3>}
    {roomsStatus==='loading'?<div className="stay-rate-loading" role="status"><strong>Checking room options…</strong><p>Explore the available property information while we check your rooms.</p></div>:roomsStatus==='error'?<p className="stay-muted">Room availability could not be checked. Open the room options to try again.</p>:!lowest&&<p>{noMatchingRates?'No rates match these preferences.':noPrices?'Room prices aren’t available.':'No room rates are available for these dates.'}</p>}
    {context&&<div className="stay-date-strip" aria-label="Selected stay dates and guests"><div><small>CHECK-IN</small><strong>{travelDateLabel(context.checkIn)}</strong></div><div><small>CHECK-OUT</small><strong>{travelDateLabel(context.checkOut)}</strong></div><div className="stay-preview-guests"><TravelIcon name="user" size={18}/><span><small>ROOMS & GUESTS</small><strong>{guestLabel}</strong></span></div></div>}
    <button type="button" className="primary" disabled={busy} onClick={roomAction}>{previewActionLabel}</button>
    {currentRate&&<dl className="stay-preview-facts"><div><dt>Room</dt><dd>{hotelRoomLabel(currentRate.option)}</dd></div><div><dt>Meals</dt><dd>{roomMealLabel(currentRate.option)}</dd></div><div><dt>Cancellation</dt><dd>{hotelCancellationLabel(currentRate.option.cancellation,now??NaN)}</dd></div></dl>}
    {currentRate&&<small className="stay-price-disclosure">The final price and conditions are checked at review. Nothing is reserved yet. Additional property-payable charges are not verified here.</small>}
   </aside>
  </div>
  <section className="stay-about" aria-labelledby="stay-about-title"><h3 id="stay-about-title" tabIndex={-1}>About this stay</h3>{property?.descriptionHeadline&&<h4 className="stay-description-headline">{property.descriptionHeadline}</h4>}{property?.description?<><p>{property.description.length>600?property.description.slice(0,600).replace(/\s+\S*$/,'')+'…':property.description}</p>{property.description.length>600&&<details className="stay-description-more"><summary>Read the full property description</summary><p>{property.description}</p></details>}</>:<p className="stay-muted">{metadataStatus==='loading'?'Property description is loading…':metadataStatus==='unavailable'?'Property description is unavailable right now.':'The supplier has not provided a property description.'}</p>}</section>
  <section className="stay-detail-info-panel" aria-labelledby="stay-amenities-title"><h3 id="stay-amenities-title" tabIndex={-1}>Property amenities</h3>{amenities.length?<ul className="stay-amenities">{amenities.map(item=><li key={item}>{item}</li>)}</ul>:<p className="stay-muted">{metadataStatus==='loading'?'Amenities are loading…':metadataStatus==='unavailable'?'Property amenities are unavailable right now.':'Amenities were not supplied for this property.'}</p>}</section>
  {location&&<section className="stay-detail-info-panel" aria-labelledby="stay-location-title"><h3 id="stay-location-title" tabIndex={-1}>Location</h3><p>{location}</p><a className="inline-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property?.address?`${name}, ${location}`:location)}`} target="_blank" rel="noreferrer">Show on map <TravelIcon name="arrow-up-right" size={16}/></a></section>}
  <div ref={detailEnd} className="stay-detail-end" aria-hidden="true"/>
  <div className="stay-mobile-action" aria-label="Quick room selection" hidden={!mobileActionVisible||(galleryOpen??localGallery)}><div><small>{currentRate?summaryPriceLabel:'Your room options'}</small><strong>{currentRate?money(currentRate.total):roomsStatus==='loading'?'Checking availability…':noMatchingRates?'No matching rates':noPrices?'No room prices':stayUnavailable?'No rooms for these dates':'Availability unavailable'}</strong></div><button type="button" className="primary" disabled={busy} onClick={roomAction}>{roomActionLabel}</button></div>
 </section>;
}

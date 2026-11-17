'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {readHotelBrowse,writeHotelBrowse,hotelJourneyUrl} from '@/lib/hotel-journey-state';
import {emptyHotelFilters,filterHotelResults,hotelAmenities,hotelAmenityOptions,selectedHotelAmenities,knownHotelTotal,stayNights,type HotelAmenityId,type HotelResult,type HotelStayContext} from '@/lib/hotel-results';
import {travelDateLabel} from '@/lib/travel-date';
import HotelPropertyMedia,{type HotelMetadataStatus} from './hotel-property-media';
import {money} from './booking-flight-card';

/** Keep supplier wording; prefer practical comparison facts and collapse formatting duplicates. */
export function hotelComparisonAmenities(values?:string[]){
 const seen=new Set<string>();
 const amenities=hotelAmenities(values).filter(value=>{const key=value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');if(seen.has(key))return false;seen.add(key);return true;});
 const usefulness=(value:string)=>/wi[ -]?fi|internet|parking|pool|restaurant|fitness|gym|air.condition/i.test(value)?0:1;
 return amenities.sort((a,b)=>usefulness(a)-usefulness(b)).slice(0,3);
}

export default function HotelResults<T extends HotelResult>({hotels,context,busy,checkingHotelId,onChoose,searchId,metadataStatus='ready',hasMore=false,loadingMore=false,loadMoreError,onLoadMore,active=true}:{active?:boolean;hasMore?:boolean;loadingMore?:boolean;loadMoreError?:string;onLoadMore?:()=>void;hotels:T[];context:HotelStayContext|null;metadataStatus?:HotelMetadataStatus;busy:boolean;checkingHotelId?:string;searchId:string;onChoose:(hotel:T,trigger:HTMLElement)=>void}){
 const [filters,setFilters]=useState(()=>readHotelBrowse(searchId).filters??{...emptyHotelFilters}),[sort,setSort]=useState(()=>readHotelBrowse(searchId).sort??'price'),[expanded,setExpanded]=useState(false);
 const drawer=useRef<HTMLDialogElement>(null),filterTrigger=useRef<HTMLButtonElement>(null);
 const filterHelpId=useId();
 useEffect(()=>{if(!active&&drawer.current?.open)drawer.current.close();},[active]);
 useEffect(()=>{
  if(!expanded||!active)return;
  const dialog=drawer.current;if(!dialog)return;
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  if(!dialog.open)dialog.showModal();
  const desktop=window.matchMedia('(min-width: 901px)');
  const closeOnDesktop=()=>{if(desktop.matches)dialog.close();};
  desktop.addEventListener('change',closeOnDesktop);
  return()=>{document.body.style.overflow=previousOverflow;desktop.removeEventListener('change',closeOnDesktop);if(dialog.open)dialog.close();};
 },[expanded,active]);
 useEffect(()=>{writeHotelBrowse(searchId,{filters,sort});},[searchId,filters,sort]);
 const shown=filterHotelResults(hotels,filters,sort),nights=stayNights(context);
 const categories=[...new Set(hotels.flatMap(h=>h.property?.starRating?[h.property.starRating]:[]))].sort((a,b)=>b-a);
 const types=[...new Set(hotels.flatMap(h=>h.property?.propertyType?[h.property.propertyType]:[]))].sort();
 const activeFilters=Object.entries(filters).filter(([key,value])=>key!=='amenities'&&value.trim());
 const selectedAmenities=selectedHotelAmenities(filters.amenities);
 const amenities=useMemo(()=>hotelAmenityOptions(hotels,filters.amenities),[hotels,filters.amenities]);
 const activeFilterCount=activeFilters.length+selectedAmenities.length;
 const hasLocations=hotels.some(hotel=>hotel.property?.city?.trim()||hotel.property?.address?.trim());
 const stayLabel=context?`${nights?`${nights} night${nights===1?'':'s'} · `:''}${context.rooms} room${context.rooms===1?'':'s'} · ${context.guests} guest${context.guests===1?'':'s'}`:'All selected rooms and guests';
 const update=(key:keyof typeof filters,value:string)=>setFilters(current=>({...current,[key]:value}));
 const toggleAmenity=(id:HotelAmenityId)=>setFilters(current=>{const selected=selectedHotelAmenities(current.amenities);return {...current,amenities:(selected.includes(id)?selected.filter(item=>item!==id):[...selected,id]).join(',')};});
 const focusResults=()=>requestAnimationFrame(()=>document.getElementById('hotel-results-title')?.focus({preventScroll:true}));
 const filterFields=()=><>
   <div className="hotel-filter-heading"><h3>Refine your stay</h3><button type="button" className="hotel-reset" disabled={!activeFilterCount} onClick={()=>setFilters({...emptyHotelFilters})}>Reset filters</button></div>
   <p>Filters apply to stays loaded so far. Load more stays to explore the rest of this destination.</p>
   <label>Property name<input type="search" value={filters.name} onChange={e=>update('name',e.target.value)} placeholder="Find a property"/></label>
   <label>Area or address<input type="search" maxLength={150} value={filters.area} onChange={e=>update('area',e.target.value)} placeholder="Search a location" aria-describedby={`${filterHelpId}-location`} disabled={!hasLocations&&!filters.area}/></label>
   <small id={`${filterHelpId}-location`}>{hasLocations?'Search the city or address shown on these stays. Properties without a matching location are excluded.':metadataStatus==='loading'?'Location details are still loading.':'Location details have not been supplied for these stays yet.'}</small>
   <fieldset className="hotel-practical-amenities"><legend>Practical amenities</legend>{amenities.length?<>{amenities.map(item=><label key={item.id} className="hotel-amenity-filter-option"><input type="checkbox" aria-label={item.label} checked={selectedAmenities.includes(item.id)} onChange={()=>toggleAmenity(item.id)}/><span>{item.label}</span><span className="hotel-filter-option-count" aria-label={`${item.count} loaded stays`}>{item.count}</span></label>)}<small>Counts cover loaded stays. Select several to require all of them; stays without these details will not appear. Charges and availability can vary.</small></>:<p className="hotel-filter-unavailable">{metadataStatus==='loading'?'Adding supplied amenities…':'No matching practical amenities have been supplied for these stays yet.'}</p>}</fieldset>
   <label>Maximum stay total (₹)<input type="number" min="0" step="1" inputMode="numeric" value={filters.budget} onChange={e=>update('budget',e.target.value)} placeholder="No limit"/></label>
   <small>Estimated total for all selected rooms. Unpriced stays are excluded when a limit is set.</small>
   <label>Property category<select aria-label="Property category" value={filters.category} onChange={e=>update('category',e.target.value)}><option value="">All categories</option>{categories.map(rating=><option key={rating} value={rating}>{rating} star{rating===1?'':'s'}</option>)}</select></label>
   <label>Property type<select aria-label="Property type" value={filters.type} onChange={e=>update('type',e.target.value)}><option value="">All property types</option>{types.map(type=><option key={type}>{type}</option>)}</select></label>
   <small>Star categories are supplied by the property provider. Guest review scores are unavailable.</small>
 </>;
 return <div className="hotel-shopping hotel-comparison">
  <div className="hotel-shopping-toolbar">
   <div className="hotel-results-heading">
    <h2 id="hotel-results-title" tabIndex={-1}>Available stays</h2>
    <p role="status" aria-live="polite">{shown.length} of {hotels.length} loaded stays{hotels.length>0&&metadataStatus!=='ready'&&<span className="hotel-content-status">{metadataStatus==='loading'?'Adding property details…':'Some details unavailable.'}</span>}</p>
    {context&&<p className="hotel-search-dates" aria-label="Selected check-in and check-out dates">{travelDateLabel(context.checkIn)} – {travelDateLabel(context.checkOut)}</p>}
    <p className="hotel-search-scope">{stayLabel}</p>
   </div>
   <label>Sort stays<select aria-label="Sort stays" value={sort} onChange={e=>setSort(e.target.value)}><option value="price">Lowest stay total</option><option value="price-desc">Highest stay total</option><option value="name">Property name</option><option value="supplier">Supplier order</option></select></label>
   <button ref={filterTrigger} className="secondary hotel-filter-toggle" type="button" aria-haspopup="dialog" aria-expanded={expanded} aria-controls="hotel-filter-dialog" onClick={()=>setExpanded(true)}>Filters{activeFilterCount?` (${activeFilterCount})`:''}</button>
  </div>
  <aside id="hotel-search-filters" className="hotel-search-filters hotel-filter-sidebar" aria-label="Filter stays">{!expanded&&filterFields()}</aside>
  <dialog ref={drawer} id="hotel-filter-dialog" className="hotel-filter-drawer" aria-labelledby="hotel-filter-dialog-title" onClose={()=>{setExpanded(false);if(active)filterTrigger.current?.focus({preventScroll:true});}} onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.currentTarget.close();}}}>
   <header><h2 id="hotel-filter-dialog-title">Filter stays</h2><button type="button" className="secondary" onClick={()=>drawer.current?.close()} aria-label="Close filters">Close <span aria-hidden="true">×</span></button></header>
   <div className="hotel-search-filters">{expanded&&filterFields()}</div>
   <footer><p role="status">{shown.length} of {hotels.length} loaded stays match</p><button type="button" className="primary" onClick={()=>drawer.current?.close()}>Show {shown.length} stay{shown.length===1?'':'s'}</button></footer>
  </dialog>
  <div className="hotel-shopping-results">
   <p className="hotel-comparison-guidance">Choose a stay to see meal plans and cancellation terms.</p>
   {activeFilterCount>0&&<div className="hotel-active-filters" aria-label="Active hotel filters">{activeFilters.map(([key,value])=><button className="hotel-filter-chip" key={key} type="button" aria-label={`Remove ${key} filter`} onClick={()=>{update(key as keyof typeof filters,'');focusResults();}}>{key==='budget'?`Up to ₹${value} / stay`:key==='category'?`${value} stars`:key==='area'?`Area: ${value}`:value}<span aria-hidden="true"> ×</span></button>)}{amenities.filter(item=>selectedAmenities.includes(item.id)).map(item=><button className="hotel-filter-chip" key={item.id} type="button" aria-label={`Remove ${item.label} filter`} onClick={()=>{toggleAmenity(item.id);focusResults();}}>{item.label}<span aria-hidden="true"> ×</span></button>)}</div>}
   <div className="booking-hotel-list">{shown.map(hotel=>{
    const contentState=hotel.propertyContentStatus==='resolved'?'ready':hotel.propertyContentStatus==='unavailable'?'unavailable':hotel.propertyContentStatus==='pending'?'loading':metadataStatus;
    const total=knownHotelTotal(hotel),amenities=hotelComparisonAmenities(hotel.property?.amenities);
    const propertyHref=hotelJourneyUrl(hotel.originSearchId??searchId,hotel.tjHotelId);
    return <article className="white-card booking-record booking-hotel-card hotel-shopping-card" key={hotel.tjHotelId} aria-label={hotel.name}>
     <div className="hotel-card-photo">
      <a href={propertyHref} aria-label={`View ${hotel.name} photos and details`} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onChoose(hotel,event.currentTarget);}}}>
       <HotelPropertyMedia name={hotel.name} photos={hotel.property?.photos} metadataStatus={contentState} showPhotoCount/>
      </a>
     </div>
     <div className="hotel-result-content">
      <div className="hotel-property-kind">{hotel.property?.propertyType||'Stay'}</div>
      <h3 id={`hotel-name-${hotel.tjHotelId}`}><a href={propertyHref} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onChoose(hotel,event.currentTarget);}}}>{hotel.name}</a></h3>
      {hotel.property?.starRating ? <p className="hotel-property-category"><span aria-hidden="true">★</span> {hotel.property.starRating}-star property category</p> : null}
      {hotel.property?.city&&<p className="hotel-property-locality">{hotel.property.city}</p>}
      <p className="hotel-property-address">{hotel.property?.address||(contentState==='loading'?'Property details loading…':contentState==='unavailable'?'Property details unavailable right now':'Address details not supplied')}</p>
      {amenities.length>0&&<ul className="hotel-amenity-list" aria-label="Property amenities">{amenities.slice(0,3).map(item=><li key={item.toLocaleLowerCase()}>{item}</li>)}</ul>}
     </div>
     <div className="hotel-result-action">
      <div className="hotel-stay-price">
       {total!==null?<><span>Estimated stay total</span><strong><span className="hotel-price-from">From </span>{money(total)}</strong></>:<strong className="hotel-price-unknown">Price available with rooms</strong>}
       <small className="hotel-price-scope">{stayLabel}</small>
       <small className="hotel-price-review-note">Final price and terms checked at review.</small>
      </div>
      {busy&&checkingHotelId===hotel.tjHotelId&&<p className="booking-selection-status" role="status">Checking available rooms… Your stay is not reserved yet.</p>}
      <button type="button" className="primary" aria-describedby={`hotel-name-${hotel.tjHotelId}`} disabled={busy} onClick={event=>onChoose(hotel,event.currentTarget)}>{busy&&checkingHotelId===hotel.tjHotelId?'Checking rooms…':<>Choose room <span aria-hidden="true">→</span></>}</button>
     </div>
    </article>;
   })}</div>
   {!shown.length&&<div className="empty-results"><h3>{hotels.length?'No stays match your filters':'No stays found'}</h3><p>{hotels.length?'Try a different location or name, remove an amenity, or adjust your category and stay budget.':'Try a different destination or date range, or load more stays if available.'}</p>{hotels.length>0&&(filters.area||selectedAmenities.length>0)&&<p>Some stays may not list the location or amenities you selected.</p>}{activeFilterCount>0&&<button className="secondary" type="button" onClick={()=>{setFilters({...emptyHotelFilters});focusResults();}}>Clear hotel filters</button>}</div>}
   {(hasMore||loadingMore||loadMoreError)&&<div className="hotel-load-more"><p>{hasMore||loadingMore?'Showing stays checked so far. More properties in this destination can be checked for your dates.':'All destination pages have been checked for your dates.'}</p>{loadMoreError&&<p role="alert">{loadMoreError}</p>}{(hasMore||loadingMore)&&<button type="button" className="secondary" disabled={busy||loadingMore} onClick={onLoadMore}>{loadingMore?'Checking more stays…':loadMoreError?'Retry loading stays':'Load more stays'}</button>}</div>}
  </div>
 </div>;
}

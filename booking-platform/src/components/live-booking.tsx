'use client';
import '@/app/booking-experience.css';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import {hotelRoomLabel,type HotelPropertyDetails,type HotelRoomOption} from '@/lib/hotel-presentation';
import {BOOKING_HANDOFF_KEY,parseBookingHandoff} from '@/lib/booking-handoff';
import {completeHotelRooms,type DraftHotelRoom} from '@/lib/hotel-occupancy';
import {bookingSearchUrl,searchRooms,searchLegs} from '@/lib/booking-search-state';
import {accountHref} from '@/lib/account-return';
import HotelRoomView,{type AvailableHotelOption} from './hotel-room-view';
import HotelResults from './hotel-results';
import {matchesFlightRefinements} from '@/lib/flight-results';
import type {HotelStayContext} from '@/lib/hotel-results';
import AirportPicker from './airport-picker';
import HotelDestination from './hotel-destination';
import NationalitySelect from './nationality-select';
import SavedProfileFill from './saved-profile-fill';
import SupplierPolicy from './supplier-policy';
import CheckoutExtras from './checkout-extras';
import BookingFlightCard,{money} from './booking-flight-card';
import {TravelHeader,TravelFooter} from './travel-shell';
import {authClient} from '@/lib/auth-client';
import useCheckoutRecovery from './use-checkout-recovery';
import {clearCheckoutMarker,saveCheckoutMarker,isResumableCheckout,isResumableHostedCheckout,parseCheckoutRecoveryStatus,type CheckoutRecoveryStatus} from '@/lib/checkout-recovery';
import { compatibleReturnPair,estimatedFare,flightStops,groupLabel,indiaToday,initialAdults,journeyMinutes,orderedGroups,parseHotelIds,paymentFailureAction,quoteRemaining,type Flight,type FlightFare } from '@/lib/booking-presentation';

type Product='FLIGHT'|'HOTEL';
type HotelOption=AvailableHotelOption;
type Hotel={tjHotelId:string;name:string;options?:HotelOption[];customerEstimateMinor?:number|null;property?:HotelPropertyDetails;propertyContentStatus?:'pending'|'resolved'|'unavailable'};
type Results={searchId:string;propertyContentPending?:boolean;propertyContentUnavailable?:boolean;results:{searchResult?:{tripInfos?:Record<string,Flight[]>};hotels?:Hotel[]}};
type Quote={quoteId:string;product:Product;hotelName?:string|null;summary?:{from?:string;to?:string;date?:string;returnDate?:string;legs?:{from:string;to:string;date:string}[];checkIn?:string;checkOut?:string;adults:number;children?:number;infants?:number;rooms?:{adults:number;children:number;childAge:number[]}[]};totalMinor:number;expiresAt:string;review:{fareRules?:unknown;conditions?:{pcs?:{pm?:boolean;pped?:boolean};dob?:{adobr?:boolean;cdobr?:boolean;idobr?:boolean};gst?:{igm?:boolean};iecr?:boolean;ipa?:boolean};option?:{roomInfo?:HotelRoomOption['roomInfo'];inclusions?:string[];mealBasis?:string;cancellation?:unknown;compliance?:{passportRequired?:boolean;panRequired?:boolean;gstType?:string};bookingNotes?:string;pricing?:{mf?:number;mft?:number}};alerts?:unknown}};
type Selection={priceIds?:string[];hid?:string;optionId?:string};
type CheckoutResult={razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string};
type Payment={provider?:'RAZORPAY';bookingId:string;orderId:string;amount:number;currency:string;keyId:string}|{provider:'PAYGLOCAL';bookingId:string;checkoutUrl:string;amount:number;currency:'INR'};
type Gateway={key:string;amount:number;currency:string;order_id:string;name:string;handler:(result:CheckoutResult)=>void;modal:{ondismiss:()=>void}};
declare global{interface Window{Razorpay?:new(options:Gateway)=>{open:()=>void;on:(event:string,callback:()=>void)=>void}}}
class BookingApiError extends Error { constructor(message:string,public status:number,public code?:string){super(message);} }
async function api<T>(path:string,data:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
  const result=await response.json();
  if(!response.ok)throw new BookingApiError(result.error||'We could not complete this request. Please try again.',response.status,result.code);
  return result;
}
function scrollToSection(id:string){requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}));}

export default function LiveBooking({prefill={},checkoutConfigured=false}:{prefill?:Record<string,string>;checkoutConfigured?:boolean}){
  const {data:session,isPending,error,refetch}=authClient.useSession();
  const resolvedIdentity=session?.user.id??'signed-out';
  const [stableIdentity,setStableIdentity]=useState<string|null>(null);
  // A temporary refetch must not destroy a draft. A settled sign-out or real
  // account change remounts the workspace, clearing all in-memory private fields.
  useEffect(()=>{
    if(isPending||error)return;
    const timer=setTimeout(()=>setStableIdentity(resolvedIdentity),0);
    return()=>clearTimeout(timer);
  },[isPending,error,resolvedIdentity]);
  const changingIdentity=!isPending&&!error&&stableIdentity!==resolvedIdentity;
  if(stableIdentity===null||changingIdentity)return <><TravelHeader/><main id="main-content" className="page-shell live-booking"><div className="white-card" role="status"><h1>{error?'Let’s reconnect your account.':'Getting your journey ready…'}</h1><p>{error?'We could not verify your session. Try again before continuing.':'Checking secure access to your booking workspace.'}</p>{error&&<button className="primary" type="button" onClick={()=>void refetch()}>Check secure session again</button>}</div></main></>;
  return <LiveBookingWorkspace key={stableIdentity} prefill={prefill} checkoutConfigured={checkoutConfigured}/>;
}

function LiveBookingWorkspace({prefill={},checkoutConfigured}:{prefill?:Record<string,string>;checkoutConfigured:boolean}){
  const router=useRouter();
  const {data:checkoutSession}=authClient.useSession();
  const [signInRequired,setSignInRequired]=useState(false);
  const [signInWithoutSelection,setSignInWithoutSelection]=useState(false);
  const [freshSearchRequired,setFreshSearchRequired]=useState(false);
  const [resumeSelection,setResumeSelection]=useState<Selection|null>(null);
  const handoffRead=useRef(false);
  const privateDraft=useRef<{party:string;values:[string,string][]}|null>(null);
  const recovery=useCheckoutRecovery();
  const initialProduct:Product=prefill.product==='HOTEL'?'HOTEL':'FLIGHT';
  const initialLegs=searchLegs(prefill.legs);
  const [submittedSearch,setSubmittedSearch]=useState(prefill);
  const [product,setProduct]=useState<Product>(initialProduct);
  const [adults,setAdults]=useState(()=>initialAdults(prefill.adults,initialProduct));
  const [children,setChildren]=useState(()=>Math.min(8,Math.max(0,Number(prefill.children)||0))),[infants,setInfants]=useState(()=>Math.min(initialAdults(prefill.adults),Math.max(0,Number(prefill.infants)||0)));
  const [cabin,setCabin]=useState(()=>['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'].includes(prefill.cabin)?prefill.cabin:'ECONOMY');
  const [multiCity,setMultiCity]=useState(Boolean(initialLegs)),[legCount,setLegCount]=useState(initialLegs?.length??2);
  const [hotelOccupancy,setHotelOccupancy]=useState<DraftHotelRoom[]>(()=>searchRooms(prefill.rooms)??[{adults:initialAdults(prefill.adults,'HOTEL'),childAge:[] as number[]}]);
  const [searchedSummary,setSearchedSummary]=useState('');
  const [hotelStayContext,setHotelStayContext]=useState<HotelStayContext|null>(null);
  const [busy,setBusy]=useState(false),[activity,setActivity]=useState(''),[message,setMessage]=useState(prefill.searchInvalid==='1'?'This search link is invalid or its dates have passed. Please choose your journey again.':'');
  const [searchValidation,setSearchValidation]=useState(false);
  const [results,setResults]=useState<Results|null>(null),[quote,setQuote]=useState<Quote|null>(null);
  const [hasFullSearchResults,setHasFullSearchResults]=useState(false);
  const [searchRecovery,setSearchRecovery]=useState(false);
  const [rooms,setRooms]=useState<{hid:string;name:string;options:HotelOption[];property?:HotelPropertyDetails}|null>(null);
  const [roomView,setRoomView]=useState(false);
  const roomReturn=useRef<{trigger:HTMLButtonElement;scrollY:number}|null>(null);
  const restoreRoomReturn=useRef(false);
  const restoreFlightResults=useRef(false);
  const flightReturn=useRef<{trigger:HTMLElement;scrollY:number}|null>(null);
  const flightSelectionFocus=useRef<'results'|'review'|null>(null);
  useEffect(()=>{
    if(quote||!results||!restoreFlightResults.current)return;
    const frame=requestAnimationFrame(()=>{restoreFlightResults.current=false;const saved=flightReturn.current;if(saved?.trigger.isConnected){saved.trigger.focus({preventScroll:true});window.scrollTo({top:saved.scrollY,behavior:'auto'});}else{const heading=document.getElementById('flight-results-title');heading?.focus({preventScroll:true});document.getElementById('booking-results')?.scrollIntoView({behavior:'auto',block:'start'});}});
    return()=>cancelAnimationFrame(frame);
  },[quote,results]);
  useEffect(()=>{
    if(!(signInRequired||signInWithoutSelection)||!message||busy)return;
    const frame=requestAnimationFrame(()=>{const heading=document.getElementById('booking-signin-title');heading?.focus({preventScroll:true});heading?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[signInRequired,signInWithoutSelection,message,busy]);
  function backToFlightResults(){if(!hasFullSearchResults){recoverSearch();return;}restoreFlightResults.current=true;setQuote(null);}
  function recoverSearch(){clearSelectionHandoff();setHasFullSearchResults(false);restoreRoomReturn.current=false;restoreFlightResults.current=false;roomReturn.current=null;flightReturn.current=null;flightSelectionFocus.current=null;setQuote(null);setResults(null);setRooms(null);setRoomView(false);setSelection(null);setSelectedFares({});setSelectedJourney([]);setSelectedRoom(null);setFreshSearchRequired(false);setSearchRecovery(true);setMessage('');}
  useEffect(()=>{
    if(!searchRecovery)return;
    const frame=requestAnimationFrame(()=>{document.getElementById('booking-search-recovery')?.focus({preventScroll:true});document.getElementById('booking-search-recovery')?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[searchRecovery]);
  useEffect(()=>{
    if(quote)return;
    const frame=requestAnimationFrame(()=>{
      if(roomView&&rooms){const heading=document.getElementById('room-choice-title');heading?.focus({preventScroll:true});document.getElementById('booking-rooms')?.scrollIntoView({behavior:'auto',block:'start'});}
      else if(restoreRoomReturn.current){restoreRoomReturn.current=false;const saved=roomReturn.current;if(saved?.trigger.isConnected){saved.trigger.focus({preventScroll:true});window.scrollTo({top:saved.scrollY,behavior:'auto'});}else document.getElementById('hotel-results-title')?.focus();}
    });
    return()=>cancelAnimationFrame(frame);
  },[roomView,rooms,quote]);
  function backToStays(){if(!hasFullSearchResults){recoverSearch();return;}restoreRoomReturn.current=true;setRoomView(false);}
  const [selectedFares,setSelectedFares]=useState<Record<string,string>>({}),[activeGroup,setActiveGroup]=useState('');
  const [filtersExpanded,setFiltersExpanded]=useState(false);
  const [departureWindow,setDepartureWindow]=useState('ALL'),[flightBudget,setFlightBudget]=useState('');
  const [sortBy,setSortBy]=useState('price'),[stopFilter,setStopFilter]=useState('ALL'),[airlineFilter,setAirlineFilter]=useState('ALL');
  const [travellerSummary,setTravellerSummary]=useState<{names:string[];email:string;phone:string}|null>(null);
  const [selectedJourney,setSelectedJourney]=useState<Flight[]>([]);
  const [selectedRoom,setSelectedRoom]=useState<HotelOption|null>(null);
  const [providerUnavailable,setProviderUnavailable]=useState(!checkoutConfigured);
  const [loadRazorpay,setLoadRazorpay]=useState(false);
  const queuedCheckout=useRef<Payment|null>(null);
  const [extrasPending,setExtrasPending]=useState(false);
  const [gstEntered,setGstEntered]=useState(false),[emergencyEntered,setEmergencyEntered]=useState(false);
  const [checkoutStep,setCheckoutStep]=useState<'travellers'|'payment'>('travellers');
  const [reviewBase,setReviewBase]=useState(0),[now,setNow]=useState<number|null>(null);
  const [selection,setSelection]=useState<Selection|null>(null),[payment,setPayment]=useState<Payment|null>(null);
  const [paymentUncertain,setPaymentUncertain]=useState(false),[needsReview,setNeedsReview]=useState(false);
  const searchForm=useRef<HTMLFormElement>(null),checkoutForm=useRef<HTMLFormElement>(null);
  const searchFocusFrame=useRef<number|null>(null);
  const autoSearchStarted=useRef(false),operation=useRef(0),requestController=useRef<AbortController|null>(null),busyRef=useRef(false);
  const mounted=useRef(true),verificationStarted=useRef(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current+=1;requestController.current?.abort();if(searchFocusFrame.current!==null)cancelAnimationFrame(searchFocusFrame.current);};},[]);
  const resultSearchId=results?.searchId;
  const propertyContentPending=results?.propertyContentPending===true;
  useEffect(()=>{
    if(!resultSearchId||!propertyContentPending)return;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    let active=true;
    // Optional static content must never hold up rates or overwrite a newer search.
    void api<{searchId:string;properties:Record<string,HotelPropertyDetails>;propertyContentStatuses?:Record<string,'resolved'|'unavailable'>}>('/api/travel/hotel-content',{searchId:resultSearchId},controller.signal).then(content=>{
      if(!active)return;
      if(content.searchId!==resultSearchId){
        setResults(current=>current?.searchId===resultSearchId?{...current,propertyContentPending:false,propertyContentUnavailable:true}:current);
        return;
      }
      setResults(current=>current?.searchId===resultSearchId?{...current,propertyContentPending:false,propertyContentUnavailable:Object.values(content.propertyContentStatuses??{}).includes('unavailable'),results:{...current.results,hotels:current.results.hotels?.map((hotel):Hotel=>({...hotel,propertyContentStatus:content.propertyContentStatuses?(content.propertyContentStatuses[hotel.tjHotelId]??'unavailable'):'resolved',property:content.properties[hotel.tjHotelId]??hotel.property}))}}:current);
    }).catch(()=>{
      if(active)setResults(current=>current?.searchId===resultSearchId?{...current,propertyContentPending:false,propertyContentUnavailable:true}:current);
    }).finally(()=>clearTimeout(timeout));
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[resultSearchId,propertyContentPending]);
  useEffect(()=>{
    if(!resultSearchId)return;
    // The results section is conditional. Scroll only after React has committed it,
    // not from the response callback where a single frame can precede that commit.
    const frame=requestAnimationFrame(()=>document.getElementById('booking-results')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
    return()=>cancelAnimationFrame(frame);
  },[resultSearchId]);
  useEffect(()=>{
    if(prefill.resumeSelection==='1'||prefill.autoSearch!=='1'||autoSearchStarted.current||recovery.blocked||paymentUncertain)return;
    const timer=setTimeout(()=>{
      if(autoSearchStarted.current)return;
      autoSearchStarted.current=true;
      const form=searchForm.current;
      if(form?.checkValidity())form.requestSubmit();
    },0);
    return()=>clearTimeout(timer);
  },[prefill.autoSearch,prefill.resumeSelection,recovery.blocked,paymentUncertain]);
  const reviewedQuoteId=quote?.quoteId;
  useEffect(()=>{
    if(!reviewedQuoteId)return;
    const frame=requestAnimationFrame(()=>{document.getElementById('booking-review-title')?.focus({preventScroll:true});document.getElementById('booking-review')?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[reviewedQuoteId,checkoutStep]);
  useEffect(()=>{
    if(!quote)return;
    const tick=()=>setNow(Date.now());
    const immediate=setTimeout(tick,0);
    const timer=setInterval(tick,1000);
    return()=>{clearTimeout(immediate);clearInterval(timer);};
  },[quote]);

  useEffect(()=>{
    if(prefill.resumeSelection!=='1'||handoffRead.current)return;
    let handoff=null;
    try{handoff=parseBookingHandoff(JSON.parse(sessionStorage.getItem(BOOKING_HANDOFF_KEY)||'null'));}catch{}
    const timer=setTimeout(()=>{
      handoffRead.current=true;
      if(!handoff){setMessage('Your previous selection has expired. Search again for current availability.');return;}
      setProduct(handoff.product);setHasFullSearchResults(false);setResults({searchId:handoff.searchId,results:{}});setSelectedJourney(handoff.flights);setResumeSelection(handoff.selection);
    },0);
    return()=>clearTimeout(timer);
  },[prefill.resumeSelection]);


  const reviewedRooms=quote?.summary?.rooms??hotelOccupancy.map(room=>({...room,children:room.childAge.length}));
  const hotelParty=reviewedRooms.flatMap((room,roomIndex)=>[...Array.from({length:room.adults},()=>({pt:'ADULT',roomIndex})),...Array.from({length:room.children},()=>({pt:'CHILD',roomIndex}))]);
  const party=quote?.product==='HOTEL'?hotelParty.map(person=>person.pt):[...Array.from({length:quote?.summary?.adults??adults},()=>'ADULT'),...Array.from({length:quote?.summary?.children??children},()=>'CHILD'),...Array.from({length:quote?.summary?.infants??infants},()=>'INFANT')];
  useEffect(()=>{
    const draft=privateDraft.current,form=checkoutForm.current;
    if(!quote||!draft||!form||draft.party!==party.join(','))return;
    for(const [name,value] of draft.values){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement||field instanceof HTMLSelectElement)field.value=value;}
    privateDraft.current=null;
    // Private values live only in this mounted account workspace, never storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quote?.quoteId]);
  const passportRequired=Boolean(quote?.review.conditions?.pcs?.pm||quote?.review.option?.compliance?.passportRequired);
  const expiryRequired=passportRequired||Boolean(quote?.review.conditions?.pcs?.pped);
  const gstRequired=Boolean(quote?.review.conditions?.gst?.igm||['PASSTHROUGH','RESELLER'].includes(quote?.review.option?.compliance?.gstType??''));
  const emergencyRequired=Boolean(quote?.review.conditions?.iecr);
  const cancellationTerms=quote?.review.option?.cancellation??quote?.review.fareRules;
  const hasCancellationTerms=cancellationTerms!==null&&cancellationTerms!==undefined&&(typeof cancellationTerms==='object'?Object.keys(cancellationTerms).length>0:typeof cancellationTerms==='string'?cancellationTerms.trim().length>0:true);
  const requiredBookingDetails=[
    passportRequired?'Passport number, nationality and expiry date for every traveller.':expiryRequired?'Passport expiry date for every traveller.':null,
    party.includes('ADULT')&&quote?.review.conditions?.dob?.adobr?'Date of birth for each adult.':null,
    party.includes('CHILD')?'Date of birth for each child.':null,
    party.includes('INFANT')?'Date of birth for each infant.':null,
    party.includes('ADULT')&&(quote?.review.conditions?.ipa||quote?.review.option?.compliance?.panRequired)?'PAN for each adult.':null,
    gstRequired?'GST number and registered business name.':null,
    emergencyRequired?'Emergency contact name, email address and phone number.':null,
  ].filter((detail):detail is string=>detail!==null);
  const remaining=quote&&now!==null?quoteRemaining(quote.expiresAt,now):null;
  const expired=remaining!==null&&remaining<=0;
  const groups=results?.results.searchResult?.tripInfos??{};
  const fareGroups=orderedGroups(groups),pairedFares=fareGroups.length>1;
  const shownGroup=fareGroups.includes(activeGroup)?activeGroup:fareGroups[0];
  const airlines=[...new Set((groups[shownGroup]??[]).flatMap(flight=>flight.sI.map(segment=>segment.fD.aI.name)).filter(Boolean))].sort();
  const flightRows=(groups[shownGroup]??[]).filter(flight=>matchesFlightRefinements(flight,shownGroup,departureWindow,flightBudget)).filter(flight=>airlineFilter==='ALL'||flight.sI.some(segment=>segment.fD.aI.name===airlineFilter)).filter(flight=>stopFilter==='ALL'||shownGroup==='COMBO'||String(flightStops(flight,shownGroup))===stopFilter).slice().sort((a,b)=>sortBy==='departure'?(a.sI[0]?.dt??'').localeCompare(b.sI[0]?.dt??''):sortBy==='duration'?(journeyMinutes(a,shownGroup)??Number.MAX_SAFE_INTEGER)-(journeyMinutes(b,shownGroup)??Number.MAX_SAFE_INTEGER):estimatedFare(a)-estimatedFare(b));
  const selectedFare=(group:string)=>groups[group]?.flatMap(flight=>flight.totalPriceList).find(fare=>fare.id===selectedFares[group]);
  const allSelected=fareGroups.every(group=>selectedFares[group]);
  useEffect(()=>{
    const target=flightSelectionFocus.current;if(!target)return;
    const frame=requestAnimationFrame(()=>{flightSelectionFocus.current=null;const element=document.getElementById(target==='review'&&allSelected?'review-selected-journey':'flight-results-title');element?.focus({preventScroll:true});element?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[selectedFares,shownGroup,allSelected]);
  const step=quote?(checkoutStep==='payment'?3:2):results?1:0;
  const summaryTitle=quote?.product==='HOTEL'?quote.hotelName||'Your selected stay':quote?.summary?.legs?quote.summary.legs.map(leg=>`${leg.from} → ${leg.to}`).join(' · '):quote?`${quote.summary?.from} → ${quote.summary?.to}`:product==='HOTEL'?'A stay that suits you':'Your next journey';

  function begin(label:string){
    if(busyRef.current)return null;
    busyRef.current=true;setBusy(true);setActivity(label);setMessage('');setSearchValidation(false);
    const id=++operation.current;
    requestController.current?.abort();
    const controller=new AbortController();requestController.current=controller;
    return {id,signal:controller.signal};
  }
  function focusOpenedSearch(panel:HTMLDetailsElement){
    if(searchFocusFrame.current!==null){cancelAnimationFrame(searchFocusFrame.current);searchFocusFrame.current=null;}
    if(!panel.open||!results||quote)return;
    const origin=document.activeElement;
    const summary=panel.querySelector(':scope > summary');
    // Native toggle is deferred: never override a field the customer has already chosen.
    if(origin!==summary&&origin!==document.body&&origin!==document.documentElement)return;
    searchFocusFrame.current=requestAnimationFrame(()=>{
      searchFocusFrame.current=null;
      if(!mounted.current||!panel.isConnected||!panel.open||document.activeElement!==origin)return;
      panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      searchForm.current?.querySelector<HTMLInputElement>(product==='HOTEL'?'input[name="city"]':'input:not([type=hidden])')?.focus({preventScroll:true});
    });
  }
  function current(id:number){return mounted.current&&operation.current===id;}
  function finish(id:number){if(current(id)){busyRef.current=false;setBusy(false);setActivity('');}}
  function report(error:unknown,id:number){if(current(id)){if(error instanceof BookingApiError&&[404,409].includes(error.status)&&/search.*(expired|no longer available)|expired.*search/i.test(error.message))setFreshSearchRequired(true);setMessage(error instanceof Error?error.message:'This request could not be completed.');scrollToSection('booking-feedback');}}
  function clearSelectionHandoff(){setSignInWithoutSelection(false);setSignInRequired(false);setResumeSelection(null);try{sessionStorage.removeItem(BOOKING_HANDOFF_KEY);}catch{}}
  function switchProduct(next:Product){
    if(busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    clearSelectionHandoff();setHasFullSearchResults(false);setSearchRecovery(false);restoreRoomReturn.current=false;restoreFlightResults.current=false;privateDraft.current=null;setProduct(next);setResults(null);setQuote(null);setRooms(null);setRoomView(false);setSelectedFares({});setMessage('');setSelection(null);setCheckoutStep('travellers');setExtrasPending(false);
  }
  async function search(form:HTMLFormElement){
    const task=begin('Finding available journeys');if(!task)return;privateDraft.current=null;setFreshSearchRequired(false);
    const fields=new FormData(form);
    let validating=true;
    try{
      const date=String(fields.get('date')??'');
      if(date<indiaToday())throw Error('Choose today or a future travel date.');
      const origin=String(fields.get('from')??'').toUpperCase(),destination=String(fields.get('to')??'').toUpperCase();
      const returnDate=String(fields.get('returnDate')??'');
      if(product==='FLIGHT'&&origin===destination)throw Error('Choose different departure and arrival airports.');
      if(product==='FLIGHT'&&(adults+children>9||infants>adults))throw Error('Adults and children must total nine or fewer. Each infant needs an adult.');
      if(product==='FLIGHT'&&!multiCity&&returnDate&&returnDate<date)throw Error('Your return date cannot be before departure.');
      if(product==='HOTEL'&&!parseHotelIds(String(fields.get('hotelIds')??'')).length)throw Error('Choose a destination from the suggestions before searching for stays.');
      if(product==='HOTEL'&&String(fields.get('end'))<=date)throw Error('Check-out must be after check-in.');
      const legs=[{from:origin,to:destination,date},...Array.from({length:legCount-1},(_,i)=>({from:String(fields.get(`leg-from-${i+1}`)).toUpperCase(),to:String(fields.get(`leg-to-${i+1}`)).toUpperCase(),date:String(fields.get(`leg-date-${i+1}`))}))];
      if(product==='FLIGHT'&&multiCity&&legs.some((leg,index)=>leg.from===leg.to||(index>0&&leg.date<legs[index-1].date)))throw Error('Choose different airports and chronological dates for every flight.');
      const completeRooms=product==='HOTEL'?completeHotelRooms(hotelOccupancy):[];
      const input=product==='FLIGHT'?{product,from:origin,to:destination,date,adults,children,infants,cabin:String(fields.get('cabin')),...(multiCity?{legs}:returnDate?{returnDate}:{})}:{product,hotelIds:parseHotelIds(String(fields.get('hotelIds')??'')),checkIn:date,checkOut:String(fields.get('end')),adults:hotelOccupancy[0].adults,rooms:completeRooms,childrenAges:completeRooms[0].childAge,nationality:String(fields.get('nationality'))};
      validating=false;setSearchValidation(false);clearSelectionHandoff();setHasFullSearchResults(false);setSearchRecovery(false);restoreRoomReturn.current=false;restoreFlightResults.current=false;
      requestAnimationFrame(()=>document.getElementById('booking-pending')?.scrollIntoView({behavior:'auto',block:'nearest'}));
      setQuote(null);setResults(null);setRooms(null);setRoomView(false);setSelectedFares({});setSelection(null);setSortBy('price');setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');setPayment(null);setPaymentUncertain(false);setNeedsReview(false);
      const data=await api<Results>('/api/travel/search',input,task.signal);
      if(current(task.id)){
        // Commit only successful submitted criteria, never an unsubmitted edit or checkout fields.
        const criteria:Record<string,string>=product==='FLIGHT'?{product,from:origin,to:destination,date,adults:String(adults),children:String(children),infants:String(infants),cabin:String(fields.get('cabin')),...(multiCity?{legs:JSON.stringify(legs)}:returnDate?{returnDate}:{})}:{product,city:String(fields.get('city')??''),hotelIds:String(fields.get('hotelIds')??''),date,end:String(fields.get('end')),adults:String(hotelOccupancy[0].adults),rooms:JSON.stringify(hotelOccupancy),nationality:String(fields.get('nationality'))};
        if(prefill.autoSearch==='1')criteria.autoSearch='1';
        const searchUrl=bookingSearchUrl(criteria);
        setSubmittedSearch(searchUrl?criteria:{product});
        window.history.replaceState(null,'',searchUrl??`/book?product=${product}`);
        if(!searchUrl)setMessage('Your search is ready. This large search cannot be saved in a link; after refreshing or signing in, choose your search again.');
        if(product==='HOTEL')setHotelStayContext({checkIn:date,checkOut:String(fields.get('end')),rooms:hotelOccupancy.length,guests:hotelOccupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)});setHasFullSearchResults(true);setResults(data);setSearchedSummary(product==='FLIGHT'?`${multiCity?legs.map(leg=>`${leg.from} → ${leg.to}`).join(' · '):`${origin} → ${destination}`} · ${date}${returnDate?` – ${returnDate}`:''} · ${adults+children+infants} traveller${adults+children+infants===1?'':'s'} · ${String(fields.get('cabin')).replaceAll('_',' ')}`:`${String(fields.get('city')||'Selected destination')} · ${date} – ${String(fields.get('end'))} · ${hotelOccupancy.length} room${hotelOccupancy.length===1?'':'s'} · ${hotelOccupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)} guest${hotelOccupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)===1?'':'s'}`);setActiveGroup(orderedGroups(data.results.searchResult?.tripInfos??{})[0]??'');}
    }catch(error){if(current(task.id))setSearchValidation(validating);report(error,task.id);}finally{finish(task.id);}
  }
  async function review(nextSelection:Selection,renew=false){
    const task=begin(renew?'Checking the latest price and rules':'Reviewing your selection');if(!task)return;
    clearSelectionHandoff();
    if(!renew&&document.activeElement instanceof HTMLElement&&document.getElementById('booking-results')?.contains(document.activeElement))flightReturn.current={trigger:document.activeElement,scrollY:window.scrollY};
    const chosenFlights=Object.values(groups).flat().filter(flight=>flight.totalPriceList.some(fare=>nextSelection.priceIds?.includes(fare.id)));
    if(chosenFlights.length)setSelectedJourney(chosenFlights.map(flight=>({...flight,totalPriceList:flight.totalPriceList.filter(fare=>nextSelection.priceIds?.includes(fare.id))})));
    const room=rooms?.options.find(option=>option.optionId===nextSelection.optionId);if(room)setSelectedRoom(room);
    try{
      const value=await api<Quote>('/api/travel/review',{searchId:results?.searchId,...nextSelection},task.signal);
      if(current(task.id)){
        setQuote(value);setSelection(nextSelection);setSignInRequired(false);try{sessionStorage.removeItem(BOOKING_HANDOFF_KEY);}catch{};setReviewBase(value.totalMinor);setNow(null);setExtrasPending(false);setCheckoutStep('travellers');setPayment(null);setPaymentUncertain(false);setNeedsReview(false);
        if(!renew){setGstEntered(false);setEmergencyEntered(false);}
        if(renew)setMessage(`Latest total ${money(value.totalMinor)}${quote&&quote.totalMinor!==value.totalMinor?` (previously ${money(quote.totalMinor)})`:''}. Price and rules refreshed. Your traveller details are kept on this page. Review optional extras again and accept the latest total before payment.`);
      }
    }catch(error){
      if(current(task.id)&&error instanceof BookingApiError&&(error.status===401||(error.status===403&&error.message==='Verify your email before continuing.'))&&results){
        const flights=chosenFlights.length?chosenFlights.map(flight=>({...flight,totalPriceList:flight.totalPriceList.filter(fare=>nextSelection.priceIds?.includes(fare.id))})):selectedJourney;
        const handoff=parseBookingHandoff({version:1,savedAt:new Date().getTime(),product,searchId:results.searchId,selection:nextSelection,flights});
        try{if(!handoff)throw Error();sessionStorage.setItem(BOOKING_HANDOFF_KEY,JSON.stringify(handoff));setSignInRequired(true);setMessage(`Your selection is saved for this tab. Sign in and verify your email to check the current price and full conditions.${checkoutConfigured?'':' Online payment remains unavailable; signing in does not enable booking.'}`);}catch{setSignInWithoutSelection(true);setMessage('Sign in to continue. Your browser cannot preserve this selection; please search again after signing in.');}
        // The committed sign-in panel owns focus; do not scroll the previous layout.
      }else report(error,task.id);
    }finally{finish(task.id);}
  }
  useEffect(()=>{
    if(!resumeSelection||!results||!checkoutSession?.user.emailVerified||recovery.blocked)return;
    const timer=setTimeout(()=>{setResumeSelection(null);void review(resumeSelection);},0);
    return()=>clearTimeout(timer);
    // review is intentionally triggered once after account and recovered IDs resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[resumeSelection,results,checkoutSession?.user.emailVerified,recovery.blocked]);
  async function chooseHotel(hotel:Hotel,trigger:HTMLButtonElement){
    const task=begin('Checking room availability');if(!task)return;
    roomReturn.current={trigger,scrollY:window.scrollY};
    try{const detail=await api<{options:HotelOption[];property?:HotelPropertyDetails}>('/api/travel/hotel-detail',{searchId:results?.searchId,hid:hotel.tjHotelId},task.signal);if(current(task.id)){setRooms({hid:hotel.tjHotelId,name:hotel.name,options:detail.options,property:detail.property??hotel.property});setRoomView(true);}}catch(error){report(error,task.id);}finally{finish(task.id);}
  }
  function chooseFare(group:string,fare:FlightFare,trigger:HTMLButtonElement){
    flightReturn.current={trigger,scrollY:window.scrollY};
    if(!pairedFares){void review({priceIds:[fare.id]});return;}
    flightSelectionFocus.current=fareGroups[fareGroups.indexOf(group)+1]?'results':'review';
    setSelectedFares(previous=>{
      const next={...previous,[group]:fare.id};
      if(group==='ONWARD'&&next.RETURN){const back=selectedFare('RETURN');if(back&&!compatibleReturnPair(fare,back))delete next.RETURN;}
      return next;
    });
    const nextGroup=fareGroups[fareGroups.indexOf(group)+1];
    if(nextGroup){setActiveGroup(nextGroup);setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}
  }
  function openCheckout(order:Payment){
    if(order.provider==='PAYGLOCAL'){
      if(!isResumableHostedCheckout({...order,canResume:true}))throw Error('Hosted checkout details could not be verified. Check My trips before paying again.');
      setActivity('Redirecting to secure checkout; payment verification follows in My trips');
      window.location.assign(order.checkoutUrl);return;
    }
    if(!window.Razorpay){queuedCheckout.current=order;setLoadRazorpay(true);setActivity('Loading secure checkout');return;}
    verificationStarted.current=false;
    const checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,order_id:order.orderId,name:'Max Travel · Test booking',handler:async result=>{
      verificationStarted.current=true;
      try{await api('/api/payments/verify',{bookingId:order.bookingId,...result});clearCheckoutMarker({bookingId:order.bookingId});if(mounted.current){recovery.clear();router.push('/my-trips');}}
      catch(error){if(mounted.current){setPaymentUncertain(true);setMessage(`${error instanceof Error?error.message:'Payment verification is pending.'} Check My trips before attempting another payment.`);scrollToSection('booking-feedback');}}
      finally{if(mounted.current){busyRef.current=false;setBusy(false);setActivity('');}}
    },modal:{ondismiss:()=>{if(!mounted.current||verificationStarted.current)return;busyRef.current=false;setBusy(false);setActivity('');setMessage('Checkout closed. Your payment order is preserved. Resume the same checkout or check My trips.');scrollToSection('booking-feedback');}}});
    checkout.on('payment.failed',()=>{if(mounted.current&&!verificationStarted.current){busyRef.current=false;setBusy(false);setActivity('');setMessage('This payment attempt failed. Your existing order is preserved; resume the same checkout to retry.');scrollToSection('booking-feedback');}});
    checkout.open();
  }
  async function submitCheckout(form:HTMLFormElement){
    if(!quote||busyRef.current)return;
    if(checkoutStep==='travellers'){const fields=new FormData(form);setTravellerSummary({names:party.map((_,index)=>`${fields.get(`title-${index}`)} ${fields.get(`first-${index}`)} ${fields.get(`last-${index}`)}`),email:String(fields.get('email')??''),phone:String(fields.get('phone')??'')});setCheckoutStep('payment');scrollToSection('booking-review');return;}
    if(extrasPending){setMessage('Apply your flight extras before continuing.');return;}
    if(expired||needsReview){setMessage(payment?'Your reviewed price has expired. Your original order is preserved; check My trips before making another payment.':'Your reviewed price has expired. Refresh the price and accept the latest terms.');return;}
    const values=new FormData(form);
    busyRef.current=true;setBusy(true);setActivity('Opening secure payment');setMessage('');
    try{
      if(payment){
        const response=await fetch(`/api/payments/status?bookingId=${encodeURIComponent(payment.bookingId)}`,{cache:'no-store'});
        const body=await response.json();
        const status=parseCheckoutRecoveryStatus(body);
        if(!response.ok||!status||(!isResumableCheckout(status)&&!isResumableHostedCheckout(status))){setPaymentUncertain(true);throw Error(status?.message||'Your order may already be processing. Check its status in My trips before paying again.');}
        if(Date.parse(quote.expiresAt)<=new Date().getTime())throw Error('This reviewed price has expired. Your original order is preserved; check My trips before making another payment.');
        const verifiedOrder:Payment=isResumableHostedCheckout(status)?status:{bookingId:status.bookingId,orderId:status.orderId,keyId:status.keyId,amount:status.amount,currency:status.currency};
        setPayment(verifiedOrder);openCheckout(verifiedOrder);return;
      }
      const travellers=party.map((pt,index)=>({ti:String(values.get(`title-${index}`)),pt,...(quote.product==='HOTEL'?{roomIndex:hotelParty[index].roomIndex}:{}),fN:String(values.get(`first-${index}`)),lN:String(values.get(`last-${index}`)),...(values.get(`dob-${index}`)?{dob:String(values.get(`dob-${index}`))}:{}),...(values.get(`passport-${index}`)?{pNum:String(values.get(`passport-${index}`))}:{}),...(values.get(`expiry-${index}`)?{eD:String(values.get(`expiry-${index}`))}:{}),...(values.get(`pan-${index}`)?{pan:String(values.get(`pan-${index}`)).toUpperCase()}:{}),...(values.get(`nationality-${index}`)?{pNat:String(values.get(`nationality-${index}`)).toUpperCase()}:{})}));
      const extra={...(values.get('gstNumber')?{gstInfo:{gstNumber:String(values.get('gstNumber')).toUpperCase(),registeredName:String(values.get('gstName')),email:String(values.get('email')),mobile:String(values.get('phone')),address:String(values.get('gstAddress'))}}:{}),...(values.get('emergencyName')?{contactInfo:{ecn:String(values.get('emergencyName')),emails:[String(values.get('emergencyEmail'))],contacts:[String(values.get('emergencyPhone'))]}}:{})};
      if(!saveCheckoutMarker({quoteId:quote.quoteId}))throw new BookingApiError('Your browser could not preserve checkout recovery. Enable session storage before starting payment.',400);
      const order=await api<Payment>('/api/payments/create',{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor,guests:{...extra,travellers,email:values.get('email'),phone:values.get('phone')}});
      if(!isResumableCheckout({...order,canResume:true})&&!isResumableHostedCheckout({...order,canResume:true}))throw Error('Payment order details could not be verified. The original attempt is preserved.');
      saveCheckoutMarker({quoteId:quote.quoteId,bookingId:order.bookingId});
      if(!mounted.current)return;
      setPayment(order);
      if(quoteRemaining(quote.expiresAt,new Date().getTime())<=0){setPaymentUncertain(true);throw Error('The price review expired while checkout was being prepared. Your original order is preserved.');}
      openCheckout(order);
    }catch(error){if(mounted.current){
      const failureMessage=error instanceof Error?error.message:'Checkout unavailable.';
      const action=paymentFailureAction(error instanceof BookingApiError?error.status:undefined,failureMessage,error instanceof BookingApiError?error.code:undefined);
      if(action==='status')setPaymentUncertain(true);else clearCheckoutMarker({quoteId:quote.quoteId});
      if(action==='refresh')setNeedsReview(true);
      if(action==='unavailable')setProviderUnavailable(true);
      if(action==='edit')setCheckoutStep('travellers');
      setMessage(`${failureMessage}${action==='status'?' Check My trips before attempting another payment.':action==='refresh'?' Refresh the reviewed price before continuing.':''}`);scrollToSection('booking-feedback');busyRef.current=false;setBusy(false);setActivity('');
    }}
  }

  async function resumeInterrupted(){
    if(!recovery.pending||busyRef.current)return;
    busyRef.current=true;setBusy(true);setActivity('Checking your existing payment order');setMessage('');
    try{
      const marker=recovery.pending;
      const query=marker.bookingId?`bookingId=${encodeURIComponent(marker.bookingId)}`:`quoteId=${encodeURIComponent(marker.quoteId)}`;
      const response=await fetch(`/api/payments/status?${query}`,{cache:'no-store'});
      const data:CheckoutRecoveryStatus|null=parseCheckoutRecoveryStatus(await response.json());
      if(!response.ok||!data||(!isResumableCheckout(data)&&!isResumableHostedCheckout(data))||!data.quoteExpiresAt||quoteRemaining(data.quoteExpiresAt,new Date().getTime())<=0)throw Error(data?.message||'This checkout cannot be resumed safely. Check My trips before paying again.');
      if(!mounted.current)return;
      const order:Payment=isResumableHostedCheckout(data)?data:{bookingId:data.bookingId,orderId:data.orderId,keyId:data.keyId,amount:data.amount,currency:data.currency};
      saveCheckoutMarker({...marker,bookingId:order.bookingId});setPayment(order);openCheckout(order);
    }catch(error){if(mounted.current){recovery.invalidate();setMessage(error instanceof Error?error.message:'Check the existing payment in My trips.');busyRef.current=false;setBusy(false);setActivity('');}}
  }

  return <><TravelHeader active={product==='FLIGHT'?'flights':'hotels'} onProductChange={switchProduct}/><main id="main-content" className={`page-shell live-booking booking-workflow journey-flow${results||quote?' has-journey':''}${!quote?' booking-shopping':''}${busy&&activity==='Finding available journeys'?' is-searching':''}${product==='HOTEL'&&results&&!quote?' hotel-results-page':''}${results&&!quote&&!pairedFares?' results-only':''}`}>
    {loadRazorpay&&<Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={()=>{const order=queuedCheckout.current;queuedCheckout.current=null;if(order&&mounted.current)openCheckout(order);}} onError={()=>{queuedCheckout.current=null;busyRef.current=false;setBusy(false);setActivity('');setMessage('Checkout could not load. Your existing order is preserved. Check My trips before trying again.');}}/>}
    <Link href="/" className="back">← Back to explore</Link>
    {busy&&<section id="booking-pending" className="booking-skeleton booking-pending" role="status" aria-live="polite" aria-label="Search and booking activity"><span aria-hidden="true" className="booking-spinner"/><strong>{activity}…</strong><p>{activity==='Finding available journeys'?'Waiting for live supplier availability. Results will appear here when the response arrives; prices are not confirmed yet.':'We’re checking the details. Please wait before trying again.'}</p><div className="booking-loading-lines" aria-hidden="true"><i/><i/><i/></div></section>}
    <div className="page-heading booking-intro"><div><>{!results&&!quote&&<div className="eyebrow">PLAN A LITTLE. LOOK FORWARD TO A LOT.</div>}<h1>{quote?'Review your trip':results?(product==='FLIGHT'?'Choose your flight':roomView?'Choose your room':'Choose your stay'):(product==='FLIGHT'?'Your next journey starts here.':'Find your somewhere special.')}</h1>{!results&&!quote&&<p>{product==='FLIGHT'?'Compare flights, make it yours, and review every detail before you pay.':'Discover stays, compare room options, and see the full stay total.'}</p>}</></div><span className="booking-test-badge">Test environment · No live payments</span></div>
    {!checkoutConfigured&&<section className="booking-status info-message booking-availability-notice" aria-label="Online payment availability"><h2>Online payment is currently unavailable.</h2><p>Explore options and compare terms, but you cannot complete a booking here. Traveller details and new payments are disabled.</p><Link className="inline-link" href="/customer-support">Contact Max Travel for booking help →</Link></section>}
    <ol className="booking-progress" aria-label="Booking progress">{(checkoutConfigured?['Search','Choose','Travellers','Review & pay']:['Search','Choose','Review selection']).map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={index<step?'is-complete':index===step?'is-current':''}><span aria-hidden="true">{index<step?'✓':index+1}</span>{label}</li>)}</ol>
    <div className="booking-layout"><div className="booking-main">
      {recovery.checking&&<div className="booking-status info-message" role="status">Checking for an interrupted checkout…</div>}
      {recovery.pending&&<section className="white-card booking-recovery" aria-label="Interrupted checkout"><div className="eyebrow">LET’S PICK UP SAFELY</div><h2>Your previous checkout needs a look.</h2><p role="status">{recovery.message}</p><p className="muted">We have paused new payments so you do not accidentally pay twice. No traveller or contact details are saved in this browser.</p>{recovery.status&&(isResumableCheckout(recovery.status)||isResumableHostedCheckout(recovery.status))&&<button type="button" className="primary" disabled={busy||recovery.checking} onClick={()=>void resumeInterrupted()}>Resume existing checkout · {money(recovery.status.amount)}</button>}<button type="button" className="secondary" disabled={busy||recovery.checking} onClick={()=>{if(recovery.pending)void recovery.reconcile(recovery.pending);}}>Check payment status again</button><Link className="secondary" href="/my-trips">Open My trips</Link>{/sign in/i.test(recovery.message)&&<Link className="inline-link" href={accountHref('/book?'+new URLSearchParams(submittedSearch).toString())}>Sign in to check your payment</Link>}</section>}
      {!recovery.pending&&recovery.message&&<p className="info-message" role="status">{recovery.message} <Link href="/my-trips">My trips →</Link></p>}
      {!results&&!quote&&<div className="account-tabs booking-product-tabs" aria-label="Booking product"><button type="button" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} aria-pressed={product==='FLIGHT'} onClick={()=>switchProduct('FLIGHT')}>✈ Flights</button><button type="button" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} aria-pressed={product==='HOTEL'} onClick={()=>switchProduct('HOTEL')}>▤ Stays</button></div>}
      {searchRecovery&&<section id="booking-search-recovery" tabIndex={-1} className="info-message" role="status"><h2>Search again to compare options</h2><p>Previous search results are not available in this tab. Search again to compare other options.</p><p>Your search criteria are kept below. No new availability request is made until you search.</p></section>}
      <details id="booking-search" className="booking-search-panel" open={!results&&!quote} onToggle={event=>focusOpenedSearch(event.currentTarget)}><summary><span className="search-panel-icon" aria-hidden="true">⌕</span>{results||quote?<><span>{searchedSummary||`${summaryTitle}${quote?.summary?.date?` · ${quote.summary.date}`:''}`}</span><small className="search-edit-label">Modify search</small></>:'Where would you like to go?'}</summary>
      <form ref={searchForm} onChange={()=>{if(searchValidation){setMessage('');setSearchValidation(false);}}} aria-label="Search availability" className="white-card live-search" onSubmit={event=>{event.preventDefault();void search(event.currentTarget);}}>
        <fieldset className="live-search-controls" disabled={busy||Boolean(quote)||Boolean(payment)||paymentUncertain||recovery.blocked}>
          {product==='FLIGHT'&&<label>Journey type<select value={multiCity?'MULTI':'STANDARD'} onChange={event=>{setMultiCity(event.target.value==='MULTI');setResults(null);setSelectedFares({});}}><option value="STANDARD">One-way / return</option><option value="MULTI">Multi-city</option></select></label>}
          <div className="form-row">{product==='FLIGHT'?<><AirportPicker name="from" label="From airport" initialCode={prefill.from||'BOM'}/><AirportPicker name="to" label="To airport" initialCode={prefill.to||'DEL'}/></>:<><HotelDestination initialQuery={prefill.city||''} initialHotelIds={parseHotelIds(prefill.hotelIds)}/><NationalitySelect initialValue={/^\d+$/.test(prefill.nationality??'')?prefill.nationality:'106'}/></>}</div>
          <div className="form-row"><label>{product==='FLIGHT'?'Departure':'Check-in'}<input name="date" required type="date" min={indiaToday()} defaultValue={prefill.date}/></label>{product==='HOTEL'&&<label>Check-out<input name="end" required type="date" min={indiaToday()} defaultValue={prefill.end}/></label>}{product==='FLIGHT'&&!multiCity&&<label>Return date, optional<input name="returnDate" type="date" min={indiaToday()} defaultValue={prefill.returnDate}/></label>}</div>
          {product==='FLIGHT'?<details className="booking-party-picker"><summary><span><strong>Travellers & cabin</strong><small>{adults} adult{adults===1?'':'s'}{children?` · ${children} child${children===1?'':'ren'}`:''}{infants?` · ${infants} infant${infants===1?'':'s'}`:''} · {cabin==='PREMIUM_ECONOMY'?'Premium economy':cabin.charAt(0)+cabin.slice(1).toLowerCase()}</small></span><span className="party-edit">Edit</span></summary><div className="form-row"><label>Adults<select value={adults} onChange={event=>{const count=Number(event.target.value);setAdults(count);setInfants(value=>Math.min(value,count));}}>{[1,2,3,4,5,6,7,8,9].map(count=><option key={count}>{count}</option>)}</select></label><label>Children · age 2–11<select value={children} onChange={event=>setChildren(Number(event.target.value))}>{[0,1,2,3,4,5,6,7,8].map(count=><option key={count}>{count}</option>)}</select></label><label>Infants · under 2<select value={infants} onChange={event=>setInfants(Number(event.target.value))}>{Array.from({length:adults+1},(_,count)=><option key={count}>{count}</option>)}</select></label><label>Cabin<select name="cabin" value={cabin} onChange={event=>setCabin(event.target.value)}><option value="ECONOMY">Economy</option><option value="PREMIUM_ECONOMY">Premium economy</option><option value="BUSINESS">Business</option><option value="FIRST">First</option></select></label></div><p className="muted">Children are aged 2–11. Each infant under 2 must travel with an adult.</p></details>:<><label>Rooms<select value={hotelOccupancy.length} onChange={event=>{const count=Number(event.target.value);setHotelOccupancy(current=>Array.from({length:count},(_,index)=>current[index]??{adults:2,childAge:[]}));}}>{[1,2,3,4].map(count=><option key={count}>{count}</option>)}</select></label>{hotelOccupancy.map((room,roomIndex)=><fieldset key={roomIndex}><legend>Room {roomIndex+1} · Guests</legend><div className="form-row"><label>Adults<select value={room.adults} onChange={event=>setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,adults:Number(event.target.value)}:value))}>{[1,2,3,4].map(count=><option key={count}>{count}</option>)}</select></label><label>Children<select value={room.childAge.length} onChange={event=>{const count=Number(event.target.value);setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,childAge:Array.from({length:count},(_,child)=>value.childAge[child]??'')}:value));}}>{[0,1,2,3].map(count=><option key={count}>{count}</option>)}</select></label>{room.childAge.map((age,childIndex)=><label key={childIndex}>Child {childIndex+1} age at check-in<input type="number" required min={0} max={17} value={age} onChange={event=>setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,childAge:value.childAge.map((child,i)=>i===childIndex?(event.target.value===''?'':Number(event.target.value)):child)}:value))}/></label>)}</div></fieldset>)}</>}
          {product==='FLIGHT'&&multiCity&&<div className="multi-city-legs">{Array.from({length:legCount-1},(_,index)=><fieldset key={index}><legend>Flight {index+2}</legend><div className="form-row"><AirportPicker name={`leg-from-${index+1}`} label="From airport" initialCode={initialLegs?.[index+1]?.from??''}/><AirportPicker name={`leg-to-${index+1}`} label="To airport" initialCode={initialLegs?.[index+1]?.to??''}/><label>Departure<input name={`leg-date-${index+1}`} defaultValue={initialLegs?.[index+1]?.date} type="date" min={indiaToday()} required/></label></div></fieldset>)}<button className="secondary" type="button" disabled={legCount>=6} onClick={()=>setLegCount(value=>value+1)}>+ Add flight</button>{legCount>2&&<button className="secondary" type="button" onClick={()=>setLegCount(value=>value-1)}>Remove last flight</button>}</div>}
          <p className="muted search-footnote">{product==='FLIGHT'?'Up to 9 adults and children, plus infants. All results show your party’s estimated total.':'Set guests for each room. Child ages must match their dates of birth at check-in.'}</p><button className="primary booking-search-submit" disabled={busy}>{busy?'Checking availability…':product==='FLIGHT'?'Search flights':'Search stays'}</button>
        </fieldset>{quote&&<p className="muted">To edit your search, return to your selection first.</p>}
      </form></details>
      <div id="booking-feedback" tabIndex={-1}>{message&&<div className={`booking-status info-message${signInRequired||signInWithoutSelection?' signin-review-gate':''}`} role="alert">
        {(signInRequired||signInWithoutSelection)&&<h2 id="booking-signin-title" tabIndex={-1}>{signInRequired?'Sign in to review your selection':'Sign in, then search again'}</h2>}<p>{message}</p>
        {signInRequired&&<div className="signin-selection-context"><strong>{product==='HOTEL'?rooms?.name||'Selected stay':'Selected flight'}</strong><p>{product==='HOTEL'?hotelRoomLabel({roomInfo:selectedRoom?.roomInfo??[]}):selectedJourney.map(flight=>`${flight.sI[0]?.da.code} → ${flight.sI.at(-1)?.aa.code} · ${flight.sI[0]?.dt.replace('T',' ').slice(0,16)}`).join(' / ')}</p><div className="signin-selection-actions"><Link className="primary" href={accountHref('/book?'+new URLSearchParams({...submittedSearch,resumeSelection:'1'}).toString())}>Sign in to review selection</Link><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{if(!hasFullSearchResults){recoverSearch();return;}if(product==='HOTEL'&&!roomView){setRoomView(true);return;}const target=document.getElementById(product==='HOTEL'?'room-choice-title':'flight-results-title');target?.focus({preventScroll:true});target?.scrollIntoView({behavior:'auto',block:'start'});}}>{product==='HOTEL'?'Back to room options':'Back to fares'}</button></div></div>}
        {!signInRequired&&/sign in/i.test(message)&&<Link className={signInWithoutSelection?"primary signin-search-again":"inline-link"} href={accountHref('/book?'+new URLSearchParams(Object.fromEntries(Object.entries(submittedSearch).filter(([key])=>!signInWithoutSelection||!['resumeSelection','autoSearch'].includes(key)))).toString())}>{signInWithoutSelection?'Sign in, then search again':'Sign in or create an account'}</Link>}
        {freshSearchRequired&&!payment&&!paymentUncertain&&<button className="secondary" type="button" disabled={busy||recovery.blocked} onClick={recoverSearch}>Start a fresh search</button>}{(payment||paymentUncertain)&&<Link className="inline-link" href="/my-trips">View payment and booking status →</Link>}
      </div>}</div>

      {results&&!hasFullSearchResults&&!quote&&!busy&&!signInRequired&&<section id="saved-selection-recovery" className="white-card saved-selection-recovery" aria-label="Saved selection"><h2>Your saved selection</h2><p>This tab has your selected option, not the complete previous search results.</p>{resumeSelection&&!checkoutSession?.user.emailVerified?<><p>Sign in and verify your email to check the current price and full conditions.{!checkoutConfigured&&' Online payment remains unavailable; signing in does not enable booking.'}</p><Link className="primary" href={accountHref('/book?'+new URLSearchParams({...submittedSearch,resumeSelection:'1'}).toString())}>Sign in to review selection</Link></>:<p>To compare other options or retry availability, search again using your retained criteria.</p>}<button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={recoverSearch}>Search again</button></section>}

      {results&&hasFullSearchResults&&<section id="booking-results" className="live-results" hidden={Boolean(quote)||(product==='HOTEL'&&roomView)} aria-label="Available options" aria-busy={busy}>
        {product==='FLIGHT'&&<div className="results-heading"><div><h2 id="flight-results-title" tabIndex={-1}>{pairedFares?`Choose your ${groupLabel(shownGroup).toLowerCase()} flight`:'Choose your flight'}</h2><p className="muted">Choose fare to compare bags, flexibility and the estimated party total.</p></div><span className="results-count" role="status" aria-live="polite">{flightRows.length} of {(groups[shownGroup]??[]).length} options · {groupLabel(shownGroup||'')}</span></div>}
        {product==='FLIGHT'&&<>
          {pairedFares&&<div className="flight-group-tabs" aria-label="Choose each flight">{fareGroups.map(group=><button type="button" key={group} className={shownGroup===group?'is-active':''} aria-pressed={shownGroup===group} onClick={()=>{setActiveGroup(group);setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}}>{groupLabel(group)} {selectedFares[group]?'✓':''}</button>)}</div>}
          {pairedFares&&<section className="journey-leg-context" aria-label="Selected flight context"><ol>{fareGroups.map(group=>{const fare=selectedFare(group),flight=groups[group]?.find(item=>item.totalPriceList.some(option=>option.id===fare?.id));return <li key={group} className={shownGroup===group?'is-current':''}><span>{groupLabel(group)}</span>{fare&&flight?<><strong>{flight.sI[0]?.da.code} → {flight.sI.at(-1)?.aa.code} · {flight.sI[0]?.dt.slice(11,16)}</strong><small>{fare.fareIdentifier.replaceAll('_',' ')}{typeof fare.customerEstimateMinor==='number'?` · ${money(fare.customerEstimateMinor)} estimated`:''}</small><button type="button" className="secondary" disabled={busy} onClick={()=>{setActiveGroup(group);setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}}>Change {groupLabel(group).toLowerCase()}</button></>:<strong>{shownGroup===group?'Choose this flight next':'Not selected yet'}</strong>}</li>;})}</ol>{allSelected&&<button id="review-selected-journey" type="button" className="primary" disabled={busy} onClick={()=>void review({priceIds:fareGroups.map(group=>selectedFares[group])})}>Review selected journey ({fareGroups.filter(group=>selectedFares[group]).length}/{fareGroups.length})</button>}</section>}
          <div className="flight-shopping">
          <div className="results-toolbar flight-shopping-controls" aria-label="Flight result controls"><label>Sort by<select aria-label="Sort by" value={sortBy} onChange={event=>setSortBy(event.target.value)}><option value="price">Lowest estimated price</option><option value="duration">Shortest known duration</option><option value="departure">Earliest departure</option></select></label><button type="button" className="secondary mobile-filter-toggle" aria-expanded={filtersExpanded} aria-controls="flight-extra-filters" onClick={()=>setFiltersExpanded(value=>!value)}>Filters{stopFilter!=='ALL'||airlineFilter!=='ALL'||departureWindow!=='ALL'||flightBudget?' •':''}</button><div id="flight-extra-filters" className={`flight-extra-filters${filtersExpanded?' is-expanded':''}`}><div className="flight-filter-intro"><strong>Refine this flight group</strong><p>Only the loaded options are filtered. Times are local to the departure airport.</p></div><label>Airline (any segment)<select aria-label="Airline (any segment)" value={airlineFilter} onChange={event=>setAirlineFilter(event.target.value)}><option value="ALL">All airlines</option>{airlines.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label>Stops<select aria-label="Stops" value={stopFilter} disabled={shownGroup==='COMBO'} onChange={event=>setStopFilter(event.target.value)}><option value="ALL">Any number of stops</option><option value="0">Non-stop</option><option value="1">1 stop</option><option value="2">2 stops</option></select></label><label>Departure time<select aria-label="Departure time" value={departureWindow} disabled={shownGroup==='COMBO'} onChange={event=>setDepartureWindow(event.target.value)}><option value="ALL">Any departure time</option><option value="EARLY">Before 06:00</option><option value="MORNING">06:00–11:59</option><option value="AFTERNOON">12:00–17:59</option><option value="EVENING">18:00–23:59</option></select></label><label>Maximum party total (₹)<input type="number" min="0" step="1" inputMode="numeric" placeholder="No limit" value={flightBudget} onChange={event=>setFlightBudget(event.target.value)}/></label><p className="flight-filter-note">Estimated price for all travellers in this flight group, not per person. Unpriced options are excluded when a limit is set. Compatible fare choices may cost more.</p>{shownGroup==='COMBO'&&<p className="muted">Complete itineraries: inspect each flight below. Stop and departure filters do not apply across multiple journeys.</p>}<button className="secondary" type="button" onClick={()=>{setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}}>Reset flight filters</button></div></div>
          <div className="flight-shopping-list">{(stopFilter!=='ALL'||airlineFilter!=='ALL'||departureWindow!=='ALL'||flightBudget)&&<div className="flight-applied-filters" aria-label="Active flight filters">{airlineFilter!=='ALL'&&<span>{airlineFilter}</span>}{stopFilter!=='ALL'&&<span>{stopFilter==='0'?'Non-stop':`${stopFilter} stop${stopFilter==='1'?'':'s'}`}</span>}{departureWindow!=='ALL'&&<span>{({EARLY:'Before 06:00',MORNING:'06:00–11:59',AFTERNOON:'12:00–17:59',EVENING:'18:00–23:59'} as Record<string,string>)[departureWindow]}</span>}{flightBudget&&<span>Up to ₹{flightBudget} / party</span>}</div>}
          {flightRows.map((flight,index)=><BookingFlightCard key={`${shownGroup}-${flight.totalPriceList[0]?.id??index}`} flight={flight} group={shownGroup} selectionMode={pairedFares?'leg':'review'} busy={busy} selectedFareId={selectedFares[shownGroup]} onSelect={(fare,trigger)=>chooseFare(shownGroup,fare,trigger)} isCompatible={fare=>{const onward=selectedFare('ONWARD');return shownGroup!=='RETURN'||!onward||compatibleReturnPair(onward,fare);}}/>)}
          {!flightRows.length&&<div className="empty-results"><h3>{fareGroups.length?'No flights match these filters':'No flights found for these airports'}</h3><p>{fareGroups.length?'Try another airline or stop filter to see more journeys.':'Try a different date, route or cabin.'}</p>{fareGroups.length>0&&<button className="secondary" type="button" onClick={()=>{setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}}>Reset filters</button>}</div>}
          </div></div>
        </>}
        {product==='HOTEL'&&<HotelResults key={results.searchId} hotels={results.results.hotels??[]} context={hotelStayContext} metadataStatus={results.propertyContentPending?'loading':results.propertyContentUnavailable||results.results.hotels?.some(hotel=>hotel.propertyContentStatus==='unavailable')?'unavailable':'ready'} busy={busy} onChoose={(hotel,trigger)=>void chooseHotel(hotel,trigger)}/>}
      </section>}
      {rooms&&roomView&&!quote&&product==='HOTEL'&&<HotelRoomView name={rooms.name} options={rooms.options} property={rooms.property} context={hotelStayContext} busy={busy} now={now} onBack={backToStays} onReview={optionId=>void review({hid:rooms.hid,optionId})}/>}
      {quote&&<form ref={checkoutForm} id="booking-review" aria-label="Review and travellers" className="white-card booking-review" onSubmit={event=>{event.preventDefault();void submitCheckout(event.currentTarget);}}>
        <div className="page-heading"><div><div className="eyebrow">{checkoutStep==='payment'?'ONE LAST LOOK':'YOUR TRIP IS TAKING SHAPE'}</div><h2 id="booking-review-title" tabIndex={-1}>{!checkoutConfigured?'Your reviewed selection':checkoutStep==='payment'?'Review your booking':'Who’s coming along?'}</h2><h3>{summaryTitle}</h3><p>{quote.summary?.date||quote.summary?.checkIn}{(quote.summary?.returnDate||quote.summary?.checkOut)?` — ${quote.summary?.returnDate||quote.summary?.checkOut}`:''} · {party.length} traveller{party.length===1?'':'s'}{quote.product==='HOTEL'?` · ${reviewedRooms.length} room${reviewedRooms.length===1?'':'s'}`:''}</p></div><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{if(checkoutForm.current)privateDraft.current={party:party.join(','),values:Array.from(new FormData(checkoutForm.current).entries()).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[0]!=='consent')};setQuote(null);setExtrasPending(false);setCheckoutStep('travellers');if(product==='HOTEL'&&rooms)setRoomView(true);else backToFlightResults();}}>Change selection</button></div>
        {!checkoutConfigured&&<section className="review-unavailable" aria-label="Payment unavailable"><h3>Payment unavailable</h3><p>This selection has been reviewed, but no booking has been made. Online payment and traveller entry are disabled.</p><div><button type="button" className="primary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{setQuote(null);setExtrasPending(false);if(product==='HOTEL')backToStays();else backToFlightResults();}}>Back to results</button><Link className="secondary" href="/customer-support">Contact MaxTravel</Link></div></section>}
        <section className="selected-itinerary" aria-label="Selected itinerary"><h3>{quote.product==='FLIGHT'?'Your selected flights':'Your selected room'}</h3>{quote.product==='FLIGHT'?selectedJourney.map((flight,index)=><BookingFlightCard key={index} flight={flight} group="COMBO" busy={true} readOnly onSelect={()=>{}} selectedFareId={flight.totalPriceList[0]?.id}/>):<><p>{quote.hotelName||rooms?.name||'Selected stay'}</p><h4>{hotelRoomLabel({roomInfo:quote.review.option?.roomInfo??selectedRoom?.roomInfo??[]})}</h4>{Boolean((quote.review.option?.inclusions??selectedRoom?.inclusions)?.length)&&<ul>{(quote.review.option?.inclusions??selectedRoom?.inclusions)?.map(item=><li key={item}>{item}</li>)}</ul>}<p>{(quote.review.option?.mealBasis??selectedRoom?.mealBasis)?.replaceAll('_',' ')||'Meal plan not supplied'}</p>{selectedRoom?.bookingNotes&&<p>{selectedRoom.bookingNotes}</p>}</>}<p className="muted">Search details are shown for your selection. The latest reviewed price and supplier conditions below take precedence.</p></section>
        <div className={`booking-expiry${expired||needsReview?' is-expired':''}`} role={expired||needsReview?'alert':undefined}><div><strong>{payment?'Payment order created':expired||needsReview?'A fresh price review is required':`Price reviewed · ${remaining===null?'checking validity':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`}`}</strong><p>{payment?'Your original order is preserved. Check My trips if your payment status is unclear.':expired||needsReview?'Keep your traveller details. Refresh the price and rules before continuing.':'Fares can change. We’ll ask you to accept any new total before payment.'}</p></div>{!payment&&!paymentUncertain&&selection&&<button type="button" className="secondary" disabled={busy} onClick={()=>void review(selection,true)}>Refresh reviewed price</button>}</div>
        <details open><summary>Fare conditions, cancellation & documents</summary>{hasCancellationTerms?<SupplierPolicy title="Cancellation and fare rules" value={cancellationTerms}/>:<section className="supplier-policy" aria-label="Cancellation and fare rules"><h4>Cancellation and fare rules</h4><p className="policy-note">Cancellation terms unavailable. Do not assume this fare is refundable. Contact support for the terms before paying.</p></section>}<section className="supplier-policy" aria-label="Required booking details"><h4>Required booking details</h4>{requiredBookingDetails.length?<ul className="fare-features">{requiredBookingDetails.map(detail=><li key={detail}>{detail}</li>)}</ul>:<p className="policy-note">No additional documents are requested in this review. Traveller names must match their travel documents.</p>}</section></details>
        {Boolean(quote.review.alerts)&&<div className="info-message"><strong>Supplier update</strong><SupplierPolicy title="Review these fare alerts" value={quote.review.alerts}/></div>}
        <fieldset className="booking-traveller-fields" disabled={!checkoutConfigured||busy||Boolean(payment)||paymentUncertain||recovery.blocked} hidden={!checkoutConfigured||checkoutStep==='payment'}>
          {party.map((pt,index)=>{
            const dobRequired=pt!=='ADULT'||Boolean(quote.review.conditions?.dob?.adobr);
            const panRequired=pt==='ADULT'&&Boolean(quote.review.conditions?.ipa||quote.review.option?.compliance?.panRequired);
            const documents=<div className="form-row"><label>Passport number{passportRequired?'':' (optional)'}<input name={`passport-${index}`} required={passportRequired} maxLength={30} autoComplete="off"/></label><label>Passport expiry{expiryRequired?'':' (optional)'}<input name={`expiry-${index}`} required={expiryRequired} type="date"/></label><label>Passport nationality · 2-letter code<input name={`nationality-${index}`} required={passportRequired} pattern="[A-Za-z]{2}" maxLength={2} placeholder="IN"/></label>{pt==='ADULT'&&<label>PAN{panRequired?'':' (optional)'}<input name={`pan-${index}`} required={panRequired} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" maxLength={10}/></label>}</div>;
            return <fieldset key={index} className="traveller-card"><legend>{quote.product==='HOTEL'?`Room ${hotelParty[index].roomIndex+1} · `:''}{pt==='ADULT'?'Adult':pt==='CHILD'?'Child':'Infant'} {index+1}</legend><p className="muted">Enter the name exactly as shown on the travel document.</p><SavedProfileFill index={index} type={pt}/><div className="form-row"><label>Title<select name={`title-${index}`} defaultValue={pt==='ADULT'?'Mr':'Master'}><option>Mr</option><option>Ms</option><option>Mrs</option><option>Master</option><option>Miss</option></select></label><label>First name<input name={`first-${index}`} required maxLength={80} autoComplete="given-name"/></label><label>Last name<input name={`last-${index}`} required maxLength={80} autoComplete="family-name"/></label>{dobRequired&&<label>Date of birth<input name={`dob-${index}`} type="date" max={indiaToday()} required/></label>}</div>{!dobRequired&&<details><summary>Add date of birth (optional)</summary><label>Date of birth<input name={`dob-${index}`} type="date" max={indiaToday()}/></label></details>}{passportRequired||expiryRequired||panRequired?<><h4>Required travel documents</h4>{documents}</>:<details><summary>Travel documents (optional for this fare)</summary>{documents}</details>}</fieldset>;
          })}
          <section className="booking-contact"><h3>Where should we send your trip details?</h3><p className="muted">Booking updates and confirmation will go to these contact details.</p><div className="form-row"><label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Indian mobile number<input name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" required placeholder="10-digit mobile number"/></label></div></section>
          <details open={gstRequired}><summary>GST billing details{gstRequired?' · Required':' · Optional'}</summary><div className="form-row"><label>GST number<input name="gstNumber" onChange={event=>setGstEntered(Boolean(event.target.value.trim()))} required={gstRequired} minLength={15} maxLength={15}/></label><label>Registered business name<input name="gstName" required={gstRequired||gstEntered} maxLength={35}/></label><label>Billing address<input name="gstAddress" maxLength={70}/></label></div></details>
          <details open={emergencyRequired}><summary>Emergency contact{emergencyRequired?' · Required':' · Optional'}</summary><div className="form-row"><label>Contact name<input name="emergencyName" onChange={event=>setEmergencyEntered(Boolean(event.target.value.trim()))} required={emergencyRequired} maxLength={100}/></label><label>Contact email<input name="emergencyEmail" required={emergencyRequired||emergencyEntered} type="email"/></label><label>Contact phone with country code<input name="emergencyPhone" required={emergencyRequired||emergencyEntered} type="tel" minLength={10} maxLength={20}/></label></div></details>
          {quote.product==='FLIGHT'&&<CheckoutExtras key={quote.quoteId} quoteId={quote.quoteId} disabled={busy||expired} onPending={setExtrasPending} onSaved={total=>setQuote(current=>current?.quoteId===quote.quoteId?{...current,totalMinor:total}:current)}/>}
        </fieldset>
        {checkoutStep==='payment'&&<div className="booking-payment-review"><h3>Check your travellers and contact details</h3>{travellerSummary&&<div className="final-traveller-summary"><ul>{travellerSummary.names.map((name,index)=><li key={index}><strong>{name}</strong> · {party[index]?.toLowerCase()}</li>)}</ul><p>Email: <strong>{travellerSummary.email}</strong></p><p>Mobile: <strong>{travellerSummary.phone}</strong></p><p className="muted">Names must match travel documents. Use Back to travellers to correct a detail.</p></div>}<h3>Your total, before you pay.</h3><p>{party.length} traveller{party.length===1?'':'s'} · {quote.product==='HOTEL'?'Full stay total':'Complete selected itinerary'}</p><strong className="booking-payment-total">{money(quote.totalMinor)}</strong><p className="muted">Payment opens with the configured secure payment provider. A successful payment is not a confirmed ticket or room: supplier confirmation follows in My trips.</p><label className="checkbox consent"><input key={`${quote.quoteId}:${quote.totalMinor}`} name="consent" type="checkbox" required disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked}/>I accept the reviewed total and supplier rules. Payment availability and booking confirmation are verified separately.</label><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>setCheckoutStep('travellers')}>Back to travellers</button></div>}
        {paymentUncertain?<Link className="primary" href="/my-trips">Check payment status in My trips</Link>:<button className="primary booking-continue" disabled={busy||extrasPending||expired||needsReview||providerUnavailable}>{providerUnavailable?'Online payment unavailable':busy?'Processing…':checkoutStep==='travellers'?'Review booking':payment?'Resume secure checkout':`Pay ${money(quote.totalMinor)} securely`}</button>}
        {extrasPending&&<p className="muted" role="status">Apply your optional extras before continuing.</p>}
      </form>}
    </div>
    {(!results||quote||pairedFares)&&<aside id="booking-summary" className="booking-summary" aria-label="Your journey summary"><div className="summary-compass" aria-hidden="true">↗</div><div className="eyebrow">YOUR TRIP COMPANION</div><h2>{quote?'Your trip, at a glance.':'Good journeys start here.'}</h2>{quote?<><h3>{summaryTitle}</h3><p>{quote.summary?.date||quote.summary?.checkIn}{(quote.summary?.returnDate||quote.summary?.checkOut)?` — ${quote.summary?.returnDate||quote.summary?.checkOut}`:''}</p><dl className="booking-summary-lines"><div><dt>Travellers</dt><dd>{party.length}</dd></div>{quote.product==='HOTEL'&&<div><dt>Rooms</dt><dd>{reviewedRooms.length}</dd></div>}<div><dt>Reviewed {quote.product==='HOTEL'?'stay':'fare'}</dt><dd>{money(reviewBase)}</dd></div>{quote.totalMinor!==reviewBase&&<div><dt>Selected flight extras</dt><dd>{money(quote.totalMinor-reviewBase)}</dd></div>}<div className="booking-total"><dt>{checkoutConfigured?'Total payable':'Reviewed total'}</dt><dd>{money(quote.totalMinor)}</dd></div></dl><p className="muted">For all travellers{quote.product==='HOTEL'?' and all rooms':''}. {quote.product==='HOTEL'?'This is the reviewed online stay total. Additional property-payable charges are not verified here; check the supplier terms or contact support before booking.':'Supplier taxes and applicable booking charges are included in the reviewed total. A detailed tax split is not provided here.'}</p></>:<><p>Compare what matters. Choose what fits. We’ll check your selection before you pay.</p>{!results&&<ol className="booking-guide"><li><span>01</span><div><strong>Start with your plans</strong><p>Choose your destination, dates and travellers.</p></div></li><li><span>02</span><div><strong>Find your fit</strong><p>Compare prices and the details that matter.</p></div></li><li><span>03</span><div><strong>Know before you go</strong><p>Review the full total and supplier terms.</p></div></li></ol>}{pairedFares&&<div className="selected-journey">{fareGroups.map(group=>{const fare=selectedFare(group);return <div key={group}><span>{groupLabel(group)}</span><strong>{fare?fare.fareIdentifier.replaceAll('_',' '):'Choose a flight'}</strong>{typeof fare?.customerEstimateMinor==='number'&&<small>{money(fare.customerEstimateMinor)} estimated</small>}</div>})}<p>Choose a fare for each flight above, then review the complete journey.</p></div>}</>}
      <ul className="booking-trust-note"><li>Full total before payment</li><li>Fare rules at review</li><li>Verified updates in My trips</li></ul><p className="booking-environment-note">Test environment · No live payments</p><Link className="inline-link" href="/my-trips">Already paid? Check My trips →</Link>
    </aside>}</div>
  {quote&&<div className="mobile-booking-action" aria-label="Quick booking summary"><div><small>{party.length} travellers · reviewed total</small><strong>{money(quote.totalMinor)}</strong></div><button className="secondary" type="button" onClick={()=>scrollToSection('booking-review')}>Review trip ↑</button></div>}
  </main><TravelFooter/></>;
}

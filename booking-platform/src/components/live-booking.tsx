"use client";
import BillingFields from './billing-fields';
import {billingFromForm,billingForProduct} from '@/lib/billing';
import FlightSelectionSummary from './flight-selection-summary';
import {appendHotelSearchPage,nextHotelSearchPage} from '@/lib/hotel-search-continuation';
import {nearbyFlightSearch} from '@/lib/nearby-flight-dates';
import {submittedBookingSearch} from '@/lib/submitted-booking-search';
import {fareDecisionName} from '@/lib/flight-decision';
import '@/app/booking-experience.css';
import '@/app/flight-results-polish.css';
import '@/app/hotel-results-polish.css';
import '@/app/flight-shopping.css';
import '@/app/hotel-shopping.css';
import '@/app/flight-filter-drawer.css';
import { useCallback,useEffect, useMemo,useRef,useState } from 'react';
import { guestDetailsIssues,panRequiredForTraveller,type GuestIssue,type PartySearch } from '@/lib/guest-validation-rules';
import { guestIssueField,guestNativeIssues,guestsFromForm,parseGuestIssues } from '@/lib/guest-form';
import { useRouter,useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {loadRazorpayCheckout,RazorpayCheckoutLoadError} from '@/lib/razorpay-checkout-loader';
import {hotelCancellationLabel,hotelRoomLabel,type HotelPropertyDetails,type HotelRoomOption} from '@/lib/hotel-presentation';
import {BOOKING_HANDOFF_KEY,inspectBookingHandoff,parseBookingHandoff,type BookingHandoff} from '@/lib/booking-handoff';
import {completeHotelRooms,type DraftHotelRoom} from '@/lib/hotel-occupancy';
import {bookingSearchPrefill,bookingSearchUrl,searchRooms,searchLegs} from '@/lib/booking-search-state';
import {accountHref} from '@/lib/account-return';
import {nextBookingSessionBoundary,type BookingSessionBoundary} from '@/lib/booking-session';
import CheckoutVerification, {type VerifiedContact} from './checkout-verification';
import {customerEmail,hasVerifiedCustomerIdentity} from '@/lib/customer-identity';
import {type AvailableHotelOption} from './hotel-room-view';
import HotelDetailView from './hotel-detail-view';
import {hotelJourneyUrl,readHotelBrowse,writeHotelBrowse} from '@/lib/hotel-journey-state';
import HotelResults from './hotel-results';
import SearchJourneyPending from './search-journey-pending';
import {travelDateLabel,travelDateTimeLabel,travelTimeLabel} from '@/lib/travel-date';
import SelectedJourneyReceipt from './selected-journey-receipt';
import {matchesFlightRefinements,groupIdenticalFlights} from '@/lib/flight-results';
import {hotelContentUnavailable,type HotelStayContext} from '@/lib/hotel-results';
import AirportPicker from './airport-picker';
import HotelDestination from './hotel-destination';
import NationalitySelect from './nationality-select';
import SavedProfileFill from './saved-profile-fill';
import SupplierPolicy from './supplier-policy';
import {hasFlightCancellationRules} from '@/lib/flight-fare-rules';
import HotelCancellationTimeline from './hotel-cancellation-timeline';
import RefreshedTerms from './refreshed-terms';
import type {ReviewTerm} from '@/lib/review-term-changes';
import CheckoutPromo from './checkout-promo';
import CheckoutExtras from './checkout-extras';
import BookingFlightCard,{money} from './booking-flight-card';
import FlightResultShortcuts,{FlightResultColumns} from './flight-result-shortcuts';
import FlightResultsControls from './flight-results-controls';
import {TravelHeader,TravelFooter,TravelIcon} from './travel-shell';
import {authClient} from '@/lib/auth-client';
import useCheckoutRecovery from './use-checkout-recovery';
import {clearCheckoutMarker,saveCheckoutMarker,isResumableCheckout,isResumableHostedCheckout,parseCheckoutRecoveryStatus,type CheckoutRecoveryStatus} from '@/lib/checkout-recovery';
import { compatibleReturnPair,estimatedFare,flightStops,groupLabel,indiaToday,initialAdults,journeyMinutes,orderedGroups,parseHotelIds,paymentFailureAction,quoteRemaining,type Flight,type FlightFare } from '@/lib/booking-presentation';

type Product='FLIGHT'|'HOTEL';
type HotelOption=AvailableHotelOption;
type Hotel={originSearchId?:string;tjHotelId:string;name:string;options?:HotelOption[];customerEstimateMinor?:number|null;property?:HotelPropertyDetails;propertyContentStatus?:'pending'|'resolved'|'unavailable'};
type Results={searchId:string;propertyContentPending?:boolean;propertyContentUnavailable?:boolean;results:{searchResult?:{tripInfos?:Record<string,Flight[]>};hotels?:Hotel[]}};
type Quote={discountMinor?:number;promoCode?:string|null;quoteId:string;product:Product;hotelName?:string|null;summary?:{from?:string;to?:string;date?:string;returnDate?:string;legs?:{from:string;to:string;date:string}[];checkIn?:string;checkOut?:string;adults:number;children?:number;infants?:number;childrenAges?:number[];rooms?:{adults:number;children:number;childAge:number[]}[]};totalMinor:number;expiresAt:string;review:{terms?:ReviewTerm[];fareRules?:unknown;conditions?:{pcs?:{pm?:boolean;pped?:boolean};dob?:{adobr?:boolean;cdobr?:boolean;idobr?:boolean};gst?:{igm?:boolean};iecr?:boolean;ipa?:boolean};option?:{roomInfo?:HotelRoomOption['roomInfo'];inclusions?:string[];mealBasis?:string;cancellation?:unknown;compliance?:{passportRequired?:boolean;panRequired?:boolean;gstType?:string};bookingNotes?:string;pricing?:{mf?:number;mft?:number}};alerts?:unknown}};
type Selection={priceIds?:string[];hid?:string;optionId?:string};
type Payment={provider?:'RAZORPAY';bookingId:string;orderId:string;amount:number;currency:string;keyId:string}|{provider:'PAYGLOCAL';bookingId:string;checkoutUrl:string;amount:number;currency:'INR'};
class BookingApiError extends Error { constructor(message:string,public status:number,public code?:string,public fields:GuestIssue[]=[]){super(message);} }
async function api<T>(path:string,data:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
  const result=await response.json();
  if(!response.ok)throw new BookingApiError(result.error||'We could not complete this request. Please try again.',response.status,result.code,parseGuestIssues(result.fields));
  return result;
}
function openGuestDetails(field:HTMLElement,form:HTMLFormElement|null){let parent=field.parentElement;while(parent&&parent!==form){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}}
function scrollToSection(id:string){requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}));}

export default function LiveBooking({prefill={},checkoutConfigured=false,billingRequired=false}:{prefill?:Record<string,string>;checkoutConfigured?:boolean;billingRequired?:boolean}){
  const {data:session,isPending,error,refetch}=authClient.useSession();
  const resolvedIdentity=session?.user.id??null;
  const [stableIdentity,setStableIdentity]=useState<BookingSessionBoundary|null>(null);
  // Inline verification carries only a guest's public choice into their account.
  // Sign-out and account switching still remount and clear every private field.
  useEffect(()=>{
    if(isPending||error)return;
    const timer=setTimeout(()=>setStableIdentity(current=>nextBookingSessionBoundary(current,resolvedIdentity)),0);
    return()=>clearTimeout(timer);
  },[isPending,error,resolvedIdentity]);
  const changingIdentity=!isPending&&!error&&stableIdentity!==null&&stableIdentity.userId!==null&&stableIdentity.userId!==resolvedIdentity;
  if(stableIdentity===null||changingIdentity)return <><TravelHeader/><main id="main-content" className="page-shell live-booking"><div className="white-card" role="status"><h1>{error?'Let’s reconnect your account.':'Getting your journey ready…'}</h1><p>{error?'We could not verify your session. Try again before continuing.':'Checking secure access to your booking workspace.'}</p>{error&&<button className="primary" type="button" onClick={()=>void refetch()}>Check secure session again</button>}</div></main></>;
  return <BookingRouteWorkspace key={stableIdentity.revision} prefill={prefill} checkoutConfigured={checkoutConfigured} billingRequired={billingRequired}/>;
}

// Server route trees may be restored after our native history handler has run.
// Keep the account boundary stable; only the mounted workspace may accept a new
// route, after checking its current URL, search ownership and checkout locks.
function BookingRouteWorkspace({prefill,checkoutConfigured,billingRequired}:{prefill:Record<string,string>;checkoutConfigured:boolean;billingRequired:boolean}){
  const [entry,setEntry]=useState(()=>({prefill:typeof window==='undefined'?prefill:currentRoutePrefill(),revision:0}));
  const adoptRoute=useCallback((next:Record<string,string>)=>setEntry(current=>({prefill:next,revision:current.revision+1})),[]);
  return <LiveBookingWorkspace key={entry.revision} prefill={entry.prefill} routePrefill={prefill} adoptRoute={adoptRoute} checkoutConfigured={checkoutConfigured} billingRequired={billingRequired}/>;
}
function currentRoutePrefill(){
  const params=new URLSearchParams(window.location.search),query:Record<string,string|string[]>={};
  for(const key of new Set(params.keys())){const values=params.getAll(key);query[key]=values.length===1?values[0]:values;}
  return bookingSearchPrefill(query);
}
function routeFingerprint(value:Record<string,string>){return JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));}
function LiveBookingWorkspace({prefill={},routePrefill,adoptRoute,checkoutConfigured,billingRequired}:{prefill?:Record<string,string>;routePrefill:Record<string,string>;adoptRoute:(next:Record<string,string>)=>void;checkoutConfigured:boolean;billingRequired:boolean}){
  const router=useRouter();
  const routeSearch=useSearchParams().toString();
  const {data:checkoutSession}=authClient.useSession();
  const [signInRequired,setSignInRequired]=useState(false);
  const [signInWithoutSelection,setSignInWithoutSelection]=useState(false);
  const [verificationSelection,setVerificationSelection]=useState<Selection|null>(null);
  const [verifiedEmail,setVerifiedEmail]=useState('');
  const [verifiedPhone,setVerifiedPhone]=useState('');
  const [freshSearchRequired,setFreshSearchRequired]=useState(false);
  const [resumeSelection,setResumeSelection]=useState<Selection|null>(null);
  const handoffRead=useRef(false),resumeReviewAllowed=useRef(false);
  const [savedHandoff,setSavedHandoff]=useState<BookingHandoff|null>(null);
  const [checkingSelection,setCheckingSelection]=useState<Selection|null>(null);
  const [checkingHotelId,setCheckingHotelId]=useState<string|undefined>();
  const handoffFeedbackFocus=useRef<string|null>(null);
  const privateDraft=useRef<{party:string;values:[string,string][]}|null>(null);
  const recovery=useCheckoutRecovery();
  const initialProduct:Product=prefill.product==='HOTEL'?'HOTEL':'FLIGHT';
  const initialLegs=searchLegs(prefill.legs);
  const [submittedSearch,setSubmittedSearch]=useState(prefill);
  const submittedSearchRoute=useRef<string|null>(null);
  const [searchPrefill,setSearchPrefill]=useState(prefill);
  const restoredLegs=searchLegs(searchPrefill.legs);
  const [product,setProduct]=useState<Product>(initialProduct);
  const [adults,setAdults]=useState(()=>initialAdults(prefill.adults,initialProduct));
  const [children,setChildren]=useState(()=>Math.min(8,Math.max(0,Number(prefill.children)||0))),[infants,setInfants]=useState(()=>Math.min(initialAdults(prefill.adults),Math.max(0,Number(prefill.infants)||0)));
  const [cabin,setCabin]=useState(()=>['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'].includes(prefill.cabin)?prefill.cabin:'ECONOMY');
  const [multiCity,setMultiCity]=useState(Boolean(initialLegs)),[legCount,setLegCount]=useState(initialLegs?.length??2);
  const [hotelOccupancy,setHotelOccupancy]=useState<DraftHotelRoom[]>(()=>searchRooms(prefill.rooms)??[{adults:initialAdults(prefill.adults,'HOTEL'),childAge:[] as number[]}]);
  const [searchedSummary,setSearchedSummary]=useState('');
  const [pendingSearchContext,setPendingSearchContext]=useState<{title:string;detail:string}|null>(null);
  const stoppedSearchFocus=useRef(false);

  const [hotelStayContext,setHotelStayContext]=useState<HotelStayContext|null>(null);
  const [uncertainPromoQuote,setUncertainPromoQuote]=useState<string|null>(null);
  const [hotelReviewFailed,setHotelReviewFailed]=useState(false);
  const [busy,setBusy]=useState(false),[activity,setActivity]=useState(''),[message,setMessage]=useState(prefill.searchInvalid==='1'?'This search link is invalid or its dates have passed. Please choose your journey again.':'');
  const [searchValidation,setSearchValidation]=useState(false);
  // One route-entry handoff failure, after its alert commits. Never refocus later
  // messages or interrupt a person who has already started using a control.
  useEffect(()=>{
    const expected=handoffFeedbackFocus.current;if(!expected)return;
    if(message!==expected){handoffFeedbackFocus.current=null;return;}
    const frame=requestAnimationFrame(()=>{
      if(handoffFeedbackFocus.current!==expected)return;
      handoffFeedbackFocus.current=null;
      const active=document.activeElement;
      if(active instanceof HTMLElement&&active.matches('input,textarea,select,button,a[href],summary,[contenteditable="true"]'))return;
      const alert=document.querySelector<HTMLElement>('#booking-feedback [role="alert"]');
      alert?.focus({preventScroll:true});alert?.scrollIntoView({behavior:'auto',block:'center'});
    });
    return()=>cancelAnimationFrame(frame);
  },[message]);
  useEffect(()=>{if(busy||!stoppedSearchFocus.current)return;const frame=requestAnimationFrame(()=>{stoppedSearchFocus.current=false;if(document.activeElement!==document.body&&document.activeElement!==document.documentElement)return;const input=searchForm.current?.querySelector<HTMLInputElement>('input:not([type=hidden])');input?.focus();});return()=>cancelAnimationFrame(frame);},[busy]);
  const [results,setResults]=useState<Results|null>(null),[quote,setQuote]=useState<Quote|null>(null);
  const checkoutHistory=useRef<{quote:Quote;searchId:string}|null>(null);
  const checkoutQuoteIds=useRef(new Set<string>());
  const preserveCheckoutFeedback=useRef(false);
  const [previousReview,setPreviousReview]=useState<Quote|null>(null);
  const [hasFullSearchResults,setHasFullSearchResults]=useState(false);
  const [searchRecovery,setSearchRecovery]=useState(false);
  const [rooms,setRooms]=useState<{searchId:string;hid:string;name:string;options:HotelOption[];property?:HotelPropertyDetails}|null>(null);
  const [roomView,setRoomView]=useState(false);
  const [selectedRoom,setSelectedRoom]=useState<HotelOption|null>(null);
  const roomReturn=useRef<{trigger:HTMLElement;scrollY:number}|null>(null);
  const [roomsStatus,setRoomsStatus]=useState<'loading'|'ready'|'error'>('ready');
  const [roomsError,setRoomsError]=useState('');
  const [galleryOpen,setGalleryOpen]=useState(false);
  const [snapshotLoading,setSnapshotLoading]=useState(false);
  const [hotelNextCursor,setHotelNextCursor]=useState(prefill.destinationCursor??''),[loadingMoreHotels,setLoadingMoreHotels]=useState(false),[hotelMoreError,setHotelMoreError]=useState('');
  const hotelMoreRequest=useRef<AbortController|null>(null);
  const hotelRequest=useRef<AbortController|null>(null);
  const hotelGeneration=useRef(0);
  const snapshotRead=useRef(false);
  const snapshotController=useRef<AbortController|null>(null);
  const restoreSelectedRate=useRef(false);
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
  function clearReviewSuccessFeedback(){setMessage(current=>current.startsWith('Price and rules updated.')?'':current);}
  function backToFlightResults(){if(!dismissSelectionGate())return;clearReviewSuccessFeedback();if(!hasFullSearchResults){recoverSearch();return;}restoreFlightResults.current=true;setQuote(null);if(!quote)requestAnimationFrame(()=>{restoreFlightResults.current=false;const target=document.getElementById('flight-results-title');target?.focus({preventScroll:true});target?.scrollIntoView({behavior:'auto',block:'start'});});}
  function recoverSearch(){snapshotController.current?.abort();setSnapshotLoading(false);hotelRequest.current?.abort();++hotelGeneration.current;const recoveryUrl=new URL(window.location.href);for(const key of ['browseSearch','flightSearch','stay','gallery','stayStep'])recoveryUrl.searchParams.delete(key);window.history.replaceState(null,'',recoveryUrl.pathname+recoveryUrl.search);setGalleryOpen(false);clearSelectionHandoff();setHasFullSearchResults(false);restoreRoomReturn.current=false;restoreFlightResults.current=false;roomReturn.current=null;flightReturn.current=null;flightSelectionFocus.current=null;setQuote(null);setResults(null);setRooms(null);setRoomView(false);setSelection(null);setSelectedFares({});setSelectedJourney([]);setSelectedRoom(null);setFreshSearchRequired(false);setSearchRecovery(true);setMessage('');}
  useEffect(()=>{
    if(!searchRecovery)return;
    const frame=requestAnimationFrame(()=>{document.getElementById('booking-search-recovery')?.focus({preventScroll:true});document.getElementById('booking-search-recovery')?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[searchRecovery]);
  useEffect(()=>{
    if(quote)return;
    const frame=requestAnimationFrame(()=>{
      if(roomView&&rooms){if(galleryOpen)return;if(restoreSelectedRate.current&&selectedRoom){restoreSelectedRate.current=false;const rate=document.querySelector<HTMLElement>(`[data-room-option-id="${CSS.escape(selectedRoom.optionId)}"]`);if(rate){rate.querySelector<HTMLButtonElement>('button.primary')?.focus({preventScroll:true});rate.scrollIntoView({behavior:'auto',block:'center'});return;}}const heading=document.getElementById('hotel-detail-title');heading?.focus({preventScroll:true});document.getElementById('booking-rooms')?.scrollIntoView({behavior:'auto',block:'start'});}
      else if(restoreRoomReturn.current){restoreRoomReturn.current=false;const saved=roomReturn.current;if(saved?.trigger.isConnected){saved.trigger.focus({preventScroll:true});window.scrollTo({top:saved.scrollY,behavior:'auto'});}else {document.getElementById('hotel-results-title')?.focus({preventScroll:true});window.scrollTo({top:readHotelBrowse(results?.searchId??'').scrollY??0,behavior:'auto'});}}
    });
    return()=>cancelAnimationFrame(frame);
  // Rate arrival must not steal focus from gallery or room controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roomView,rooms?.hid,quote]);
  function backToStays(){if(!dismissSelectionGate())return;clearReviewSuccessFeedback();if(!hasFullSearchResults){recoverSearch();return;}
    if(window.history.state?.hotelEntry==='detail'&&!galleryOpen){window.history.back();return;}
    if(results)window.history.replaceState(null,'',hotelJourneyUrl(results.searchId));
    restoreRoomReturn.current=true;setRoomView(false);setGalleryOpen(false);
  }
  const [selectedFares,setSelectedFares]=useState<Record<string,string>>({}),[activeGroup,setActiveGroup]=useState('');
  const [departureWindow,setDepartureWindow]=useState('ALL'),[flightBudget,setFlightBudget]=useState('');
  const [sortBy,setSortBy]=useState('price'),[stopFilter,setStopFilter]=useState('ALL'),[airlineFilter,setAirlineFilter]=useState('ALL');
  const [guestErrors,setGuestErrors]=useState<GuestIssue[]>([]);
  const guestErrorFocus=useRef(false);
  const [travellerSummary,setTravellerSummary]=useState<{names:string[];email:string;phone:string}|null>(null);
  const travellerReviewCurrent=useRef(false);
  const [selectedJourney,setSelectedJourney]=useState<Flight[]>([]);
  const [providerUnavailable,setProviderUnavailable]=useState(!checkoutConfigured);
  const checkoutLaunch=useRef(0);
  const [extrasPending,setExtrasPending]=useState(false);
  const [promoRevision,setPromoRevision]=useState(0);
  const [extrasResetNotice,setExtrasResetNotice]=useState(false);
  const extrasApplied=useRef(false);
  const refreshedContinuation=useRef<{quoteId:string;advance:boolean;extrasReset:boolean;fromStep:'travellers'|'payment'}|null>(null);
  const [gstEntered,setGstEntered]=useState(false),[emergencyEntered,setEmergencyEntered]=useState(false);
  const [checkoutStep,setCheckoutStep]=useState<'travellers'|'payment'>('travellers');
  const [reviewBase,setReviewBase]=useState(0),[now,setNow]=useState<number|null>(null);
  const [selection,setSelection]=useState<Selection|null>(null),[payment,setPayment]=useState<Payment|null>(null);
  const [paymentUncertain,setPaymentUncertain]=useState(false),[needsReview,setNeedsReview]=useState(false);
  const searchForm=useRef<HTMLFormElement>(null),checkoutForm=useRef<HTMLFormElement>(null);
  const searchFocusFrame=useRef<number|null>(null);
  const autoSearchStarted=useRef(false),operation=useRef(0),requestController=useRef<AbortController|null>(null),busyRef=useRef(false);
  const mounted=useRef(true),verificationStarted=useRef(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current+=1;checkoutLaunch.current+=1;requestController.current?.abort();hotelRequest.current?.abort();snapshotController.current?.abort();hotelMoreRequest.current?.abort();if(searchFocusFrame.current!==null)cancelAnimationFrame(searchFocusFrame.current);};},[]);
  const ownedRoute=useRef<{url:string;state:unknown}>({url:'/book?'+new URLSearchParams(prefill).toString(),state:null});
  useEffect(()=>{
    const rememberRoute=()=>{
      const hotelEntry=window.history.state?.hotelEntry,bookingCheckout=window.history.state?.bookingCheckout;
      // Keep only our own state; Next must manage its private router tree.
      ownedRoute.current={url:window.location.pathname+window.location.search,state:{...(['detail','gallery','review'].includes(hotelEntry)?{hotelEntry}:{}),...(bookingCheckout?{bookingCheckout}:{})}};
    };
    const currentRoute=currentRoutePrefill();
    if(submittedSearchRoute.current===window.location.pathname+window.location.search){rememberRoute();return;}
    // Native property/list/gallery traversal belongs to this loaded snapshot,
    // including the initial restoration while its request is still pending.
    if(currentRoute.flightSearch&&(currentRoute.flightSearch===results?.searchId||currentRoute.flightSearch===prefill.flightSearch)){rememberRoute();return;}
    if(currentRoute.browseSearch&&(currentRoute.browseSearch===results?.searchId||results?.results.hotels?.some(hotel=>hotel.originSearchId===currentRoute.browseSearch)||currentRoute.browseSearch===prefill.browseSearch)){rememberRoute();return;}
    if(routeFingerprint(currentRoute)===routeFingerprint(submittedSearch)){rememberRoute();return;}
    if(currentRoute.selectionKey&&currentRoute.selectionKey===savedHandoff?.key){rememberRoute();return;}
    // A cached server tree is not authority for the current browser entry. Do
    // not remember a mismatching URL: it may be a new Link awaiting its RSC data.
    if(routeFingerprint(currentRoute)!==routeFingerprint(routePrefill))return;
    const timer=setTimeout(()=>{
      if(routeFingerprint(currentRoutePrefill())!==routeFingerprint(currentRoute))return;
      if(payment||paymentUncertain||recovery.blocked||busyRef.current){
        window.history.replaceState(ownedRoute.current.state,'',ownedRoute.current.url);
        setMessage(payment||paymentUncertain||recovery.blocked?'Finish checking your current payment before starting a different search.':'Finish or stop the current availability or review request before starting a different search.');
        return;
      }
      // Unmount cleanup invalidates in-flight requests and private drafts. It is
      // deliberate only for a genuine new route, never a same-search traversal.
      adoptRoute(currentRoute);
    },0);
    return()=>clearTimeout(timer);
  },[routeSearch,routePrefill,submittedSearch,results,prefill.browseSearch,prefill.flightSearch,savedHandoff?.key,payment,paymentUncertain,recovery.blocked,adoptRoute]);
  const propertyContentGeneration=useRef(0);
  const resultSearchId=results?.searchId;
  const propertyContentPending=results?.propertyContentPending===true;
  useEffect(()=>{
    const generation=++propertyContentGeneration.current;
    if(!resultSearchId||!propertyContentPending)return;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    let active=true;
    const isCurrent=()=>active&&propertyContentGeneration.current===generation;
    // Optional static content must never hold up rates or overwrite a newer search.
    void api<{searchId:string;properties:Record<string,HotelPropertyDetails>;propertyContentStatuses?:Record<string,'resolved'|'unavailable'>}>('/api/travel/hotel-content',{searchId:resultSearchId},controller.signal).then(content=>{
      if(!isCurrent())return;
      if(content.searchId!==resultSearchId){
        setResults(current=>isCurrent()&&current?.searchId===resultSearchId?{...current,propertyContentPending:false,propertyContentUnavailable:true,results:{...current.results,hotels:hotelContentUnavailable(current.results.hotels??[],resultSearchId)}}:current);
        return;
      }
      setResults(current=>isCurrent()&&current?.searchId===resultSearchId?{...current,propertyContentPending:false,propertyContentUnavailable:Object.values(content.propertyContentStatuses??{}).includes('unavailable'),results:{...current.results,hotels:current.results.hotels?.map((hotel):Hotel=>hotel.originSearchId&&hotel.originSearchId!==resultSearchId?hotel:({...hotel,propertyContentStatus:content.propertyContentStatuses?(content.propertyContentStatuses[hotel.tjHotelId]??'unavailable'):'resolved',property:content.properties[hotel.tjHotelId]??hotel.property}))}}:current);
    }).catch(()=>{
      if(isCurrent())setResults(current=>isCurrent()&&current?.searchId===resultSearchId?{...current,propertyContentPending:false,propertyContentUnavailable:true,results:{...current.results,hotels:hotelContentUnavailable(current.results.hotels??[],resultSearchId)}}:current);
    }).finally(()=>clearTimeout(timeout));
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[resultSearchId,propertyContentPending]);
  useEffect(()=>{
    if(!resultSearchId||new URLSearchParams(window.location.search).has('stay'))return;
    // The results section is conditional. Scroll only after React has committed it,
    // not from the response callback where a single frame can precede that commit.
    const frame=requestAnimationFrame(()=>document.getElementById('booking-results')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
    return()=>cancelAnimationFrame(frame);
  },[resultSearchId]);
  useEffect(()=>{
    const entry=new URLSearchParams(window.location.search);
    if(entry.has('browseSearch')||entry.has('flightSearch')||entry.get('resumeSelection')==='1'||entry.get('autoSearch')!=='1'||prefill.autoSearch!=='1'||autoSearchStarted.current||recovery.blocked||paymentUncertain)return;
    const timer=setTimeout(()=>{
      const currentEntry=new URLSearchParams(window.location.search);
      if(currentEntry.has('browseSearch')||currentEntry.has('flightSearch')||autoSearchStarted.current||currentEntry.get('autoSearch')!=='1'||currentEntry.get('resumeSelection')==='1')return;
      autoSearchStarted.current=true;
      const form=searchForm.current;
      if(form?.checkValidity())form.requestSubmit();
    },0);
    return()=>clearTimeout(timer);
  },[prefill.autoSearch,prefill.resumeSelection,recovery.blocked,paymentUncertain]);
  const reviewedQuoteId=quote?.quoteId;
  const focusRefreshedTerms=useRef(false);
  useEffect(()=>{
    if(!reviewedQuoteId)return;
    const frame=requestAnimationFrame(()=>{const target=document.getElementById(focusRefreshedTerms.current?'refreshed-terms-title':'booking-review-title');focusRefreshedTerms.current=false;target?.focus({preventScroll:true});target?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[reviewedQuoteId,checkoutStep]);
  useEffect(()=>{
    if(!quote&&!roomView)return;
    const tick=()=>setNow(Date.now());
    const immediate=setTimeout(tick,0);
    const timer=setInterval(tick,1000);
    return()=>{clearTimeout(immediate);clearInterval(timer);};
  },[quote,roomView]);

  useEffect(()=>{
    // Read the actual history URL: Next may restore the previous route tree whose
    // server prefill predates our native replaceState at the sign-in gate.
    const entry=new URLSearchParams(window.location.search);
    if(entry.get('resumeSelection')!=='1'||handoffRead.current)return;
    let recovered=inspectBookingHandoff(null);
    try{recovered=inspectBookingHandoff(JSON.parse(sessionStorage.getItem(BOOKING_HANDOFF_KEY)||'null'),new Date().getTime(),{userId:checkoutSession?.user.id??null,key:entry.get('selectionKey')??undefined});}catch{}
    const timer=setTimeout(()=>{
      handoffRead.current=true;autoSearchStarted.current=true;
      resumeReviewAllowed.current=entry.get('resumeReview')!=='0';
      if(recovered.state!=='ready'){if(recovered.state==='expired')try{sessionStorage.removeItem(BOOKING_HANDOFF_KEY);}catch{}const feedback=recovered.state==='expired'?'Your previous selection has expired. Search again for current availability.':'We couldn’t recover your selection in this tab. Return to the original tab, or search again for current availability.';handoffFeedbackFocus.current=feedback;setMessage(feedback);return;}
      const handoff=recovered.handoff;
      setSavedHandoff(handoff);setProduct(handoff.product);setHasFullSearchResults(false);setResults({searchId:handoff.searchId,results:{}});setSelectedJourney(handoff.flights);setResumeSelection(handoff.selection);
    },0);
    return()=>clearTimeout(timer);
  },[prefill.resumeSelection,checkoutSession?.user.id]);


  useEffect(()=>{
    if(!savedHandoff||hasFullSearchResults||quote||signInRequired)return;
    const frame=requestAnimationFrame(()=>{const panel=document.getElementById('saved-selection-recovery');panel?.focus({preventScroll:true});panel?.scrollIntoView({behavior:'auto',block:'start'});});
    return()=>cancelAnimationFrame(frame);
  },[savedHandoff,hasFullSearchResults,quote,signInRequired]);

  const reviewedRooms=quote?.product==='HOTEL'&&quote.summary?(quote.summary.rooms??[{adults:quote.summary.adults,children:quote.summary.childrenAges?.length??0,childAge:quote.summary.childrenAges??[]}]):hotelOccupancy.map(room=>({...room,children:room.childAge.length}));
  const hotelParty=reviewedRooms.flatMap((room,roomIndex)=>[...Array.from({length:room.adults},()=>({pt:'ADULT',roomIndex})),...Array.from({length:room.children},()=>({pt:'CHILD',roomIndex}))]);
  const party=quote?.product==='HOTEL'?hotelParty.map(person=>person.pt):[...Array.from({length:quote?quote.summary?.adults??0:adults},()=>'ADULT'),...Array.from({length:quote?quote.summary?.children??0:children},()=>'CHILD'),...Array.from({length:quote?quote.summary?.infants??0:infants},()=>'INFANT')];
  useEffect(()=>{if(quote&&results)checkoutHistory.current={quote,searchId:results.searchId};},[quote,results]);
  useEffect(()=>{
    const draft=privateDraft.current,form=checkoutForm.current;
    if(!quote||!draft||!form||draft.party!==party.join(','))return;
    for(const [name,value] of draft.values){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement||field instanceof HTMLSelectElement)field.value=value;}
    setGstEntered(Boolean(form.elements.namedItem('gstNumber') instanceof HTMLInputElement&&(form.elements.namedItem('gstNumber') as HTMLInputElement).value.trim()));
    setEmergencyEntered(Boolean(form.elements.namedItem('emergencyName') instanceof HTMLInputElement&&(form.elements.namedItem('emergencyName') as HTMLInputElement).value.trim()));
    privateDraft.current=null;
    // Private values live only in this mounted account workspace, never storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quote?.quoteId]);
  const focusGuestIssue=useCallback((issue:GuestIssue)=>{
    const field=checkoutForm.current?.elements.namedItem(guestIssueField(issue.path).name);
    const target=field instanceof HTMLElement?field:document.getElementById('traveller-errors');
    if(target){openGuestDetails(target,checkoutForm.current);target.focus({preventScroll:true});target.scrollIntoView({behavior:'auto',block:'center'});}
  },[]);
  useEffect(()=>{
    if(!guestErrorFocus.current||checkoutStep!=='travellers'||!guestErrors.length)return;
    const frame=requestAnimationFrame(()=>{
      guestErrorFocus.current=false;
      for(const issue of guestErrors){const name=guestIssueField(issue.path).name;const field=checkoutForm.current?.elements.namedItem(name);if(field instanceof HTMLElement)openGuestDetails(field,checkoutForm.current);}
      focusGuestIssue(guestErrors[0]);
    });
    return()=>cancelAnimationFrame(frame);
  },[guestErrors,checkoutStep,focusGuestIssue]);
  function showGuestErrors(issues:GuestIssue[]){guestErrorFocus.current=true;setGuestErrors(issues);setCheckoutStep('travellers');}
  function fieldIssues(name:string){return guestErrors.filter(issue=>guestIssueField(issue.path).name===name);}
  function fieldProps(name:string,hint?:string){return {id:`guest-${name}`,'aria-invalid':fieldIssues(name).length?true:undefined,'aria-describedby':[hint,fieldIssues(name).length?`guest-error-${name}`:undefined].filter(Boolean).join(' ')||undefined};}
  function fieldError(name:string){const issues=fieldIssues(name);return issues.length?<span className="guest-field-error" id={`guest-error-${name}`} aria-hidden="true">{issues.map(issue=>issue.message).join(' ')}</span>:null;}
  function guestIssueLabel(issue:GuestIssue){const field=guestIssueField(issue.path);return field.index===undefined?field.label:`${quote?.product==='HOTEL'?`Room ${hotelParty[field.index]?.roomIndex+1} · `:''}${party[field.index]==='CHILD'?'Child':party[field.index]==='INFANT'?'Infant':'Adult'} ${field.index+1} · ${field.label}`;}
  // summary is returned by reviewSupplier from the quote's persisted search.
  // Never validate against the editable search form or URL prefill.
  const reviewedSearch:PartySearch|undefined=quote?.summary&&(quote.product==='FLIGHT'&&quote.summary.date?{product:'FLIGHT',date:quote.summary.date,returnDate:quote.summary.returnDate,legs:quote.summary.legs,adults:quote.summary.adults,children:quote.summary.children??0,infants:quote.summary.infants??0}:quote.product==='HOTEL'&&quote.summary.checkIn&&quote.summary.checkOut?{product:'HOTEL',checkIn:quote.summary.checkIn,checkOut:quote.summary.checkOut,adults:quote.summary.adults,childrenAges:quote.summary.childrenAges??[],rooms:quote.summary.rooms}:undefined);
  // Wait for refreshed requirements and restored private fields to commit before
  // validating. This continuation can show review, but can never start payment.
  useEffect(()=>{
    const pending=refreshedContinuation.current;
    if(busy||!quote||pending?.quoteId!==quote.quoteId)return;
    const timer=setTimeout(()=>{
      if(refreshedContinuation.current!==pending||busyRef.current||payment||paymentUncertain||recovery.blocked)return;
      refreshedContinuation.current=null;
      const form=checkoutForm.current;if(!form)return;
      if(pending.advance){
        const guests=validatedGuests(form);
        if(!guests)return;
        if(pending.extrasReset){if(window.history.state?.bookingCheckout?.step==='payment'){preserveCheckoutFeedback.current=true;window.history.back();}setCheckoutStep('travellers');return;}
        showPaymentReview(guests,pending.fromStep==='payment');
      }
      requestAnimationFrame(()=>{const title=document.getElementById('refreshed-terms-title');title?.focus({preventScroll:true});title?.scrollIntoView({behavior:'auto',block:'start'});});
    },0);
    return()=>clearTimeout(timer);
    // Runs once per completed refresh, using committed fields and requirements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quote?.quoteId,busy,payment,paymentUncertain,recovery.blocked]);
  const passportRequired=Boolean(quote?.review.conditions?.pcs?.pm||quote?.review.option?.compliance?.passportRequired);
  const expiryRequired=passportRequired||Boolean(quote?.review.conditions?.pcs?.pped);
  const gstRequired=Boolean(quote?.review.conditions?.gst?.igm||['PASSTHROUGH','RESELLER'].includes(quote?.review.option?.compliance?.gstType??''));
  const emergencyRequired=Boolean(quote?.review.conditions?.iecr);
  const cancellationTerms=quote?.review.option?.cancellation??quote?.review.fareRules;
  const hasCancellationTerms=cancellationTerms!==null&&cancellationTerms!==undefined&&(typeof cancellationTerms==='object'?Object.keys(cancellationTerms).length>0:typeof cancellationTerms==='string'?cancellationTerms.trim().length>0:true);
  const cancellationNeedsAttention=quote?.product==='FLIGHT'?!hasFlightCancellationRules(cancellationTerms):!hasCancellationTerms;
  const requiredBookingDetails=[
    passportRequired?'Passport number, nationality and expiry date for every traveller.':expiryRequired?'Passport expiry date for every traveller.':null,
    party.includes('ADULT')&&quote?.review.conditions?.dob?.adobr?'Date of birth for each adult.':null,
    party.includes('CHILD')?'Date of birth for each child.':null,
    party.includes('INFANT')?'Date of birth for each infant.':null,
    party.includes('ADULT')&&quote?.review.conditions?.ipa===true?'PAN for each adult, required by this fare.':party.includes('ADULT')&&quote?.review.option?.compliance?.panRequired===true?'PAN for the primary guest only, required by this room rate.':null,
    gstRequired?'GST number and registered business name.':null,
    emergencyRequired?'Emergency contact name, email address and phone number.':null,
  ].filter((detail):detail is string=>detail!==null);
  const remaining=quote&&now!==null?quoteRemaining(quote.expiresAt,now):null;
  const expired=remaining!==null&&remaining<=0;
  const groups=useMemo(()=>Object.fromEntries(Object.entries(results?.results.searchResult?.tripInfos??{}).map(([key,flights])=>[key,groupIdenticalFlights(flights)])),[results]);
  const fareGroups=orderedGroups(groups),pairedFares=fareGroups.length>1;
  const shownGroup=fareGroups.includes(activeGroup)?activeGroup:fareGroups[0];
  const airlines=[...new Set((groups[shownGroup]??[]).flatMap(flight=>flight.sI.map(segment=>segment.fD.aI.name)).filter(Boolean))].sort();
  const selectedFare=(group:string)=>groups[group]?.flatMap(flight=>flight.totalPriceList).find(fare=>fare.id===selectedFares[group]);
  const onwardFare=selectedFare('ONWARD');
  const compatibleFare=(fare:FlightFare)=>shownGroup!=='RETURN'||!onwardFare||compatibleReturnPair(onwardFare,fare);
  // Sorting and the budget use the same selectable offers as the visible headline.
  // The original flight retains every offer and ID for comparison and review.
  const comparableFlight=(flight:Flight):Flight=>({...flight,totalPriceList:flight.totalPriceList.filter(compatibleFare)});
  const groupFlights=groups[shownGroup]??[];
  const hasKnownDuration=groupFlights.some(flight=>journeyMinutes(flight,shownGroup)!==null);
  const hasKnownDeparture=groupFlights.some(flight=>travelTimeLabel(flight.sI[0]?.dt)!=='Time unavailable');
  const effectiveSort=(sortBy==='duration'&&!hasKnownDuration)||(sortBy==='departure'&&!hasKnownDeparture)?'price':sortBy;
  const flightSortOptions=[
    {value:'price',label:'Lowest price',description:'Estimated total for all travellers',disabled:false},
    {value:'duration',label:'Shortest',description:'Total journey duration where supplied',disabled:!hasKnownDuration},
    {value:'departure',label:'Earliest',description:'Local departure date and time',disabled:!hasKnownDeparture},
  ];
  const departureKey=(flight:Flight)=>travelTimeLabel(flight.sI[0]?.dt)==='Time unavailable'?null:flight.sI[0].dt.slice(0,16);
  const compareDeparture=(left:Flight,right:Flight)=>{
    const a=departureKey(left),b=departureKey(right);
    if(a===null)return b===null?0:1;
    if(b===null)return -1;
    return a.localeCompare(b);
  };
  const flightRows=groupFlights.filter(flight=>matchesFlightRefinements(comparableFlight(flight),shownGroup,departureWindow,flightBudget)).filter(flight=>airlineFilter==='ALL'||flight.sI.some(segment=>segment.fD.aI.name===airlineFilter)).filter(flight=>stopFilter==='ALL'||shownGroup==='COMBO'||String(flightStops(flight,shownGroup))===stopFilter).slice().sort((a,b)=>{
    const eligibility=Number(b.totalPriceList.some(compatibleFare))-Number(a.totalPriceList.some(compatibleFare));
    if(eligibility)return eligibility;
    return effectiveSort==='departure'?compareDeparture(a,b):effectiveSort==='duration'?(journeyMinutes(a,shownGroup)??Number.MAX_SAFE_INTEGER)-(journeyMinutes(b,shownGroup)??Number.MAX_SAFE_INTEGER):estimatedFare(comparableFlight(a))-estimatedFare(comparableFlight(b));
  });
  const FLIGHT_PAGE=25,flightListKey=`${results?.searchId}|${shownGroup}|${effectiveSort}|${stopFilter}|${airlineFilter}|${departureWindow}|${flightBudget}`;
  const [flightLimit,setFlightLimit]=useState({key:'',count:FLIGHT_PAGE});
  const flightShown=flightLimit.key===flightListKey?flightLimit.count:FLIGHT_PAGE;
  const visibleFlightRows=flightRows.filter((flight,index)=>index<flightShown||flight.totalPriceList.some(fare=>fare.id===selectedFares[shownGroup]));

  const allSelected=fareGroups.every(group=>selectedFares[group]);
  useEffect(()=>{
    const target=flightSelectionFocus.current;if(!target)return;
    const frame=requestAnimationFrame(()=>{
      flightSelectionFocus.current=null;
      const reviewing=target==='review'&&allSelected;
      const element=document.getElementById(reviewing?'review-selected-journey':'flight-results-title');
      element?.focus({preventScroll:true});
      const context=reviewing?element?.closest<HTMLElement>('.flight-selection-summary'):null;
      // Guided selection must settle with the price and next action together;
      // `auto` would inherit the page's smooth scrolling and race keyboard focus.
      if(context&&context.getBoundingClientRect().height<=window.innerHeight-32)context.scrollIntoView({behavior:'instant',block:'start'});
      else element?.scrollIntoView({behavior:'instant',block:reviewing?'end':'start'});
    });
    return()=>cancelAnimationFrame(frame);
  },[selectedFares,shownGroup,allSelected]);
  const verificationActive=signInRequired||signInWithoutSelection;
  const checkoutStarted=Boolean(quote)||verificationActive||Boolean(busy&&verificationSelection);
  const step=quote?(checkoutStep==='payment'?2:1):checkoutStarted?1:0;
  const previousFlightDate=nearbyFlightSearch(submittedSearch,-1,indiaToday()),nextFlightDate=nearbyFlightSearch(submittedSearch,1,indiaToday());
  const selectedEstimates=selectedJourney.map(estimatedFare);
  const selectedEstimate=hasFullSearchResults?(product==='HOTEL'
    ?(selectedRoom&&Number.isFinite(selectedRoom.pricing.totalPrice)&&selectedRoom.pricing.totalPrice>0?Math.round(selectedRoom.pricing.totalPrice*100):null)
    :(selectedEstimates.length&&selectedEstimates.every(Number.isFinite)?selectedEstimates.reduce((total,value)=>total+value,0):null)):null;
  const summaryTitle=quote?.product==='HOTEL'?quote.hotelName||'Your selected stay':quote?.summary?.legs?quote.summary.legs.map(leg=>`${leg.from} → ${leg.to}`).join(' · '):quote?`${quote.summary?.from} → ${quote.summary?.to}`:product==='HOTEL'?'A stay that suits you':'Your next journey';

  function begin(label:string){
    if(busyRef.current)return null;
    stoppedSearchFocus.current=false;busyRef.current=true;setBusy(true);setActivity(label);setMessage('');setSearchValidation(false);
    const id=++operation.current;
    requestController.current?.abort();
    const controller=new AbortController();requestController.current=controller;
    return {id,signal:controller.signal};
  }
  function stopAvailabilitySearch(){
    if(!busyRef.current||activity!=='Finding available journeys')return;
    ++operation.current;requestController.current?.abort();requestController.current=null;busyRef.current=false;stoppedSearchFocus.current=true;setBusy(false);setActivity('');setMessage('Search stopped on this page. Your details are kept; edit them or search again.');
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
  function savePrivateDraft(){
    if(checkoutForm.current)privateDraft.current={party:party.join(','),values:Array.from(new FormData(checkoutForm.current).entries()).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[0]!=='consent')};
  }
  function checkoutHistoryState(nextQuote:Quote,nextStep:'travellers'|'payment'){
    return {...(product==='HOTEL'?{hotelEntry:'review'}:{}),bookingCheckout:{quoteId:nextQuote.quoteId,step:nextStep}};
  }
  function backToTravellers(){
    if(busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    if(window.history.state?.bookingCheckout?.step==='payment')window.history.back();
    else setCheckoutStep('travellers');
  }
  function changeSelection(){
    if(busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    clearReviewSuccessFeedback();savePrivateDraft();setQuote(null);setExtrasPending(false);setCheckoutStep('travellers');
    const stage=window.history.state?.bookingCheckout;
    if(product==='HOTEL'&&rooms&&hasFullSearchResults){
      restoreSelectedRate.current=true;setRoomView(true);
      if(stage)window.history.go(stage.step==='payment'?-2:-1);
      else if(window.history.state?.hotelEntry==='review')window.history.back();
      else window.history.replaceState(null,'',hotelJourneyUrl(rooms.searchId,rooms.hid));
    }else{
      backToFlightResults();
      if(stage&&hasFullSearchResults)window.history.go(stage.step==='payment'?-2:-1);
    }
  }
  function finish(id:number){if(current(id)){busyRef.current=false;setBusy(false);setActivity('');setCheckingSelection(null);setCheckingHotelId(undefined);}}
  function report(error:unknown,id:number){if(current(id)){if(error instanceof BookingApiError&&[404,409].includes(error.status)&&/search.*(expired|no longer available)|expired.*search/i.test(error.message))setFreshSearchRequired(true);setMessage(error instanceof Error?error.message:'This request could not be completed.');scrollToSection('booking-feedback');}}
  function selectionReturnUrl(handoff=savedHandoff,review=true){
    const criteria={...submittedSearch,resumeSelection:'1',resumeReview:review?'1':'0',...(handoff?.key?{selectionKey:handoff.key}:{})};
    // Keep returnTo within its allowlisted size even for a large multi-city search.
    return bookingSearchUrl(criteria)??('/book?'+new URLSearchParams({product,resumeSelection:'1',resumeReview:review?'1':'0',...(handoff?.key?{selectionKey:handoff.key}:{})}).toString());
  }
  function clearSelectionHandoff(){
    setSignInWithoutSelection(false);setSignInRequired(false);setVerificationSelection(null);setResumeSelection(null);setSavedHandoff(null);
    try{sessionStorage.removeItem(BOOKING_HANDOFF_KEY);}catch{}
    const url=new URL(window.location.href);for(const key of ['resumeSelection','resumeReview','selectionKey','autoSearch'])url.searchParams.delete(key);
    window.history.replaceState(null,'',url.pathname+url.search);
  }
  /** An explicit return to browsing abandons the pending selection, not an
   * actual Sign in navigation. Never clear or restart an uncertain checkout. */
  function dismissSelectionGate(){
    if(payment||paymentUncertain||recovery.blocked)return false;
    if(checkingSelection){++operation.current;requestController.current?.abort();busyRef.current=false;setBusy(false);setActivity('');setCheckingSelection(null);}
    if(signInRequired||signInWithoutSelection||savedHandoff){resumeReviewAllowed.current=false;clearSelectionHandoff();setMessage('');setSelection(null);setPreviousReview(null);}
    return true;
  }
  function returnToRoomOptions(){
    if(!dismissSelectionGate())return;
    if(!hasFullSearchResults||!rooms){recoverSearch();return;}
    setRoomView(true);window.history.replaceState(null,'',hotelJourneyUrl(rooms.searchId,rooms.hid));
    requestAnimationFrame(()=>{const selected=selectedRoom?document.querySelector<HTMLElement>(`[data-room-option-id="${CSS.escape(selectedRoom.optionId)}"] button.primary`):null;const target=selected??document.getElementById('hotel-room-options-title');target?.focus({preventScroll:true});target?.scrollIntoView({behavior:'auto',block:'center'});});
  }
  function switchProduct(next:Product){
    if(busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    // A permitted product change supersedes asynchronous hotel browsing, but never
    // bypasses an in-flight checkout or uncertain-payment guard above.
    ++operation.current;snapshotController.current?.abort();hotelRequest.current?.abort();++hotelGeneration.current;
    setSnapshotLoading(false);setGalleryOpen(false);setRoomsStatus('ready');setRoomsError('');
    const url=new URL(window.location.href);for(const key of ['browseSearch','flightSearch','stay','gallery','stayStep'])url.searchParams.delete(key);url.searchParams.set('product',next);window.history.replaceState(null,'',url.pathname+url.search);
    clearSelectionHandoff();checkoutHistory.current=null;setHasFullSearchResults(false);setSearchRecovery(false);restoreRoomReturn.current=false;restoreFlightResults.current=false;privateDraft.current=null;setProduct(next);setResults(null);setQuote(null);setRooms(null);setRoomView(false);setSelectedFares({});setMessage('');setSelection(null);setCheckoutStep('travellers');setExtrasPending(false);
  }
  async function search(form:HTMLFormElement){
    const task=begin('Finding available journeys');if(!task)return;snapshotController.current?.abort();setSnapshotLoading(false);hotelMoreRequest.current?.abort();setLoadingMoreHotels(false);setHotelMoreError('');privateDraft.current=null;checkoutHistory.current=null;setFreshSearchRequired(false);
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
      if(product==='HOTEL'&&!parseHotelIds(String(fields.get('hotelIds')??'')).length){
        const regionId=String(fields.get('regionId')??'');let cursor=String(fields.get('destinationCursor')??'');
        if(!regionId||!cursor)throw Error('Choose a destination from the suggestions before searching for stays.');
        for(let attempt=0;attempt<5&&cursor;attempt++){
          const page=await api<{hotelIds:string[];nextCursor:string|null}>('/api/travel/destination-hotels',{regionId,cursor},task.signal);
          if(!current(task.id))return;
          fields.set('hotelIds',page.hotelIds.join(','));fields.set('destinationCursor',page.nextCursor??'');
          if(page.hotelIds.length)break;
          cursor=page.nextCursor??'';
          const cursorField=form.elements.namedItem('destinationCursor');if(cursorField instanceof HTMLInputElement)cursorField.value=cursor;
        }
        if(!parseHotelIds(String(fields.get('hotelIds')??'')).length)throw Error(cursor?'No stays in these destination batches. Search again to check the next available batch.':'No hotels were found for this destination. Choose another destination.');
      }
      if(product==='HOTEL'&&String(fields.get('end'))<=date)throw Error('Check-out must be after check-in.');
      const legs=[{from:origin,to:destination,date},...Array.from({length:legCount-1},(_,i)=>({from:String(fields.get(`leg-from-${i+1}`)).toUpperCase(),to:String(fields.get(`leg-to-${i+1}`)).toUpperCase(),date:String(fields.get(`leg-date-${i+1}`))}))];
      if(product==='FLIGHT'&&multiCity&&legs.some((leg,index)=>leg.from===leg.to||(index>0&&leg.date<legs[index-1].date)))throw Error('Choose different airports and chronological dates for every flight.');
      const completeRooms=product==='HOTEL'?completeHotelRooms(hotelOccupancy):[];
      // Display-only formatting: submitted criteria and provider payloads keep ISO dates.
      const displayDates=product==='HOTEL'?`${travelDateLabel(date)} – ${travelDateLabel(String(fields.get('end')))}`:`${travelDateLabel(date)}${returnDate?` – ${travelDateLabel(returnDate)}`:''}`;
      const input=product==='FLIGHT'?{product,from:origin,to:destination,date,adults,children,infants,cabin:String(fields.get('cabin')),...(multiCity?{legs}:returnDate?{returnDate}:{})}:{product,hotelIds:parseHotelIds(String(fields.get('hotelIds')??'')),checkIn:date,checkOut:String(fields.get('end')),adults:hotelOccupancy[0].adults,rooms:completeRooms,childrenAges:completeRooms[0].childAge,nationality:String(fields.get('nationality'))};
      setPendingSearchContext(product==='FLIGHT'?{title:multiCity?legs.map(leg=>`${leg.from} → ${leg.to}`).join(' · '):`${origin} → ${destination}`,detail:`${displayDates} · ${adults+children+infants} traveller${adults+children+infants===1?'':'s'} · ${String(fields.get('cabin')).replaceAll('_',' ')}`}:{title:String(fields.get('city')||'Your selected destination'),detail:`${displayDates} · ${completeRooms.length} room${completeRooms.length===1?'':'s'} · ${completeRooms.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)} guest${completeRooms.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)===1?'':'s'}`});
      validating=false;setSearchValidation(false);snapshotController.current?.abort();setSnapshotLoading(false);hotelRequest.current?.abort();++hotelGeneration.current;setGalleryOpen(false);clearSelectionHandoff();setHasFullSearchResults(false);setSearchRecovery(false);restoreRoomReturn.current=false;restoreFlightResults.current=false;
      requestAnimationFrame(()=>{if(current(task.id))document.getElementById('booking-pending')?.scrollIntoView({behavior:'auto',block:'start'});});
      setQuote(null);setResults(null);setRooms(null);setRoomView(false);setSelectedFares({});setSelection(null);setSortBy('price');setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');setPayment(null);setPaymentUncertain(false);setNeedsReview(false);
      const data=await api<Results>('/api/travel/search',input,task.signal);
      if(current(task.id)){
        // Commit only successful submitted criteria, never an unsubmitted edit or checkout fields.
        const criteria:Record<string,string>=product==='FLIGHT'?{product,from:origin,to:destination,date,adults:String(adults),children:String(children),infants:String(infants),cabin:String(fields.get('cabin')),...(multiCity?{legs:JSON.stringify(legs)}:returnDate?{returnDate}:{})}:{product,city:String(fields.get('city')??''),hotelIds:String(fields.get('hotelIds')??''),date,end:String(fields.get('end')),adults:String(hotelOccupancy[0].adults),rooms:JSON.stringify(hotelOccupancy),nationality:String(fields.get('nationality')),regionId:String(fields.get('regionId')??''),destinationCursor:String(fields.get('destinationCursor')??'')};
        if(product==='HOTEL')setHotelNextCursor(criteria.destinationCursor);
        if(prefill.autoSearch==='1')criteria.autoSearch='1';
        const committedSearch=submittedBookingSearch(criteria);
        const searchUrl=committedSearch.shareable?committedSearch.url:null;
        setSubmittedSearch(committedSearch.criteria);submittedSearchRoute.current=committedSearch.url;
        window.history.replaceState(null,'',committedSearch.url);
        if(!searchUrl)setMessage('Your search is ready. This large search cannot be saved in a link; after refreshing or signing in, choose your search again.');
        if(product==='HOTEL')setHotelStayContext({checkIn:date,checkOut:String(fields.get('end')),rooms:hotelOccupancy.length,guests:hotelOccupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)});setHasFullSearchResults(true);setResults(data);setSearchedSummary(product==='FLIGHT'?`${multiCity?legs.map(leg=>`${leg.from} → ${leg.to}`).join(' · '):`${origin} → ${destination}`} · ${displayDates} · ${adults+children+infants} traveller${adults+children+infants===1?'':'s'} · ${String(fields.get('cabin')).replaceAll('_',' ')}`:`${String(fields.get('city')||'Selected destination')} · ${displayDates} · ${hotelOccupancy.length} room${hotelOccupancy.length===1?'':'s'} · ${hotelOccupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)} guest${hotelOccupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)===1?'':'s'}`);setActiveGroup(orderedGroups(data.results.searchResult?.tripInfos??{})[0]??'');}
    }catch(error){if(current(task.id)){setSearchValidation(validating);if(product==='HOTEL'&&fields.get('regionId'))setSearchPrefill(current=>({...current,city:String(fields.get('city')??''),hotelIds:String(fields.get('hotelIds')??''),regionId:String(fields.get('regionId')??''),destinationCursor:String(fields.get('destinationCursor')??''),date:String(fields.get('date')??''),end:String(fields.get('end')??''),nationality:String(fields.get('nationality')??'106')}));}report(error,task.id);}finally{finish(task.id);}
  }
  async function review(nextSelection:Selection,renew=false,continueToPayment=checkoutStep==='payment'){
    if(busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    if(!hasFullSearchResults&&savedHandoff){
      const restored=inspectBookingHandoff(savedHandoff,new Date().getTime(),{userId:checkoutSession?.user.id??null,key:savedHandoff.key});
      if(restored.state!=='ready'){clearSelectionHandoff();setResults(null);setFreshSearchRequired(true);setMessage(restored.state==='expired'?'Your previous selection has expired. Search again for current availability.':'We couldn’t recover this selection for your current account. Search again for current availability.');scrollToSection('booking-feedback');return;}
    }
    const reviewSearchId=product==='HOTEL'&&rooms&&rooms.hid===nextSelection.hid?rooms.searchId:results?.searchId;
    const resetExtras=renew&&(extrasApplied.current||extrasPending);
    if(renew)savePrivateDraft();
    refreshedContinuation.current=null;
    const task=begin(renew?'Checking the latest price and rules':'Checking your fare and availability');if(!task)return;
    setHotelReviewFailed(false);setSignInRequired(false);setSignInWithoutSelection(false);setResumeSelection(null);setCheckingSelection(nextSelection);
    if(!renew&&document.activeElement instanceof HTMLElement&&document.getElementById('booking-results')?.contains(document.activeElement))flightReturn.current={trigger:document.activeElement,scrollY:window.scrollY};
    const chosenFlights=Object.values(groups).flat().filter(flight=>flight.totalPriceList.some(fare=>nextSelection.priceIds?.includes(fare.id)));
    if(chosenFlights.length)setSelectedJourney(chosenFlights.map(flight=>({...flight,totalPriceList:flight.totalPriceList.filter(fare=>nextSelection.priceIds?.includes(fare.id))})));
    const room=rooms?.options.find(option=>option.optionId===nextSelection.optionId);if(room)setSelectedRoom(room);
    try{
      const value=await api<Quote>('/api/travel/review',{searchId:reviewSearchId,...nextSelection},task.signal);
      if(current(task.id)){
        const nextStep=renew?checkoutStep:'travellers';
        refreshedContinuation.current=renew?{quoteId:value.quoteId,advance:continueToPayment,extrasReset:resetExtras,fromStep:checkoutStep}:null;
        if(!renew)checkoutQuoteIds.current.clear();
        checkoutQuoteIds.current.add(value.quoteId);
        extrasApplied.current=false;
        setExtrasResetNotice(resetExtras);
        focusRefreshedTerms.current=renew;setPreviousReview(renew?quote:null);setGuestErrors([]);setQuote(value);setSelection(nextSelection);clearSelectionHandoff();setReviewBase(value.totalMinor);setNow(null);setExtrasPending(false);setCheckoutStep(nextStep);setPayment(null);setPaymentUncertain(false);setNeedsReview(false);
        travellerReviewCurrent.current=false;checkoutHistory.current=results?{quote:value,searchId:results.searchId}:null;
        let checkoutUrl=product==='HOTEL'&&results&&nextSelection.hid?hotelJourneyUrl(reviewSearchId??results.searchId,nextSelection.hid,false,true):window.location.pathname+window.location.search;
        if(product==='FLIGHT'&&results){
          const handoff=parseBookingHandoff({version:1,savedAt:savedHandoff?.savedAt??Date.now(),key:crypto.randomUUID(),...(checkoutSession?.user.id?{ownerId:checkoutSession.user.id}:{}),product,searchId:results.searchId,selection:nextSelection,flights:chosenFlights.map(flight=>({...flight,totalPriceList:flight.totalPriceList.filter(fare=>nextSelection.priceIds?.includes(fare.id))}))});
          if(handoff)try{sessionStorage.setItem(BOOKING_HANDOFF_KEY,JSON.stringify(handoff));setSavedHandoff(handoff);handoffRead.current=true;checkoutUrl=selectionReturnUrl(handoff,false);}catch{}
        }
        window.history[renew?'replaceState':'pushState'](checkoutHistoryState(value,nextStep),'',checkoutUrl);
        if(!renew){setGstEntered(false);setEmergencyEntered(false);}
        if(renew)setMessage(`Price and rules updated. Your traveller details are kept.${resetExtras?' Flight extras were reset. Choose any extras again before continuing.':''} Review the latest total before choosing Agree & pay.`);
      }
    }catch(error){
      if(current(task.id)&&error instanceof BookingApiError&&(error.status===401||(error.status===403&&error.message==='Verify your email before continuing.'))&&results){
        const flights=chosenFlights.length?chosenFlights.map(flight=>({...flight,totalPriceList:flight.totalPriceList.filter(fare=>nextSelection.priceIds?.includes(fare.id))})):selectedJourney;
        const prior=savedHandoff?.searchId===reviewSearchId?savedHandoff:null;
        const sameSelection=prior&&JSON.stringify(prior.selection)===JSON.stringify(nextSelection);
        const handoff=parseBookingHandoff({version:1,savedAt:prior?.savedAt??new Date().getTime(),key:(sameSelection?prior?.key:undefined)??crypto.randomUUID(),...(checkoutSession?.user.id?{ownerId:checkoutSession.user.id}:{}),product,searchId:reviewSearchId,selection:nextSelection,flights,...(product==='HOTEL'?{hotel:rooms?{name:rooms.name,roomLabel:hotelRoomLabel({roomInfo:room?.roomInfo??[]}),mealBasis:room?.mealBasis}:prior?.hotel}:{})});
        // The mounted checkout keeps the complete search and selection. Storage
        // is only a public-choice recovery aid if this tab is later reloaded.
        setVerificationSelection(nextSelection);setSavedHandoff(handoff);handoffRead.current=true;
        if(handoff)try{sessionStorage.setItem(BOOKING_HANDOFF_KEY,JSON.stringify(handoff));window.history.replaceState(null,'',selectionReturnUrl(handoff,false));}catch{}
        setSignInRequired(true);setSignInWithoutSelection(false);setMessage('Your choice is kept here while you verify your email. We’ll check its latest price and availability next.');
      }else {if(current(task.id)&&product==='HOTEL'&&!renew)setHotelReviewFailed(true);if(current(task.id)&&error instanceof BookingApiError&&[400,403,404,409].includes(error.status))clearSelectionHandoff();report(error,task.id);}
    }finally{finish(task.id);}
  }
  function continueVerifiedSelection(contact:VerifiedContact){
    if(!mounted.current||busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    setVerifiedEmail(contact.email);setVerifiedPhone(contact.phoneNumber??'');
    const nextSelection=verificationSelection??resumeSelection??savedHandoff?.selection;
    if(nextSelection&&results){resumeReviewAllowed.current=false;void review(nextSelection);}
    else {clearSelectionHandoff();setMessage('Sign-in verified. Choose your flight or room to continue.');}
  }
  useEffect(()=>{
    if(!resumeReviewAllowed.current||!resumeSelection||!results||!hasVerifiedCustomerIdentity(checkoutSession?.user)||recovery.blocked)return;
    const timer=setTimeout(()=>{setResumeSelection(null);void review(resumeSelection);},0);
    return()=>clearTimeout(timer);
    // review is intentionally triggered once after account and recovered IDs resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[resumeSelection,results,checkoutSession?.user.emailVerified,checkoutSession?.user.phoneNumberVerified,recovery.blocked]);
  // Browser Back follows checkout stages while keeping private entries only in
  // this account's mounted workspace. History never contains traveller fields.
  useEffect(()=>{
    function restoreCheckout(event:PopStateEvent){
      if(window.location.pathname!=='/book')return;
      const target=event.state?.bookingCheckout,cached=checkoutHistory.current;
      if(payment||paymentUncertain||recovery.blocked||busyRef.current){
        if(quote)window.history.pushState(checkoutHistoryState(quote,checkoutStep),'',ownedRoute.current.url);
        return;
      }
      if(cached&&cached.searchId===results?.searchId&&checkoutQuoteIds.current.has(target?.quoteId)&&['travellers','payment'].includes(target.step)){
        // Forward must never show the previous review after traveller/contact
        // edits. Only the explicit Review action validates and rebuilds it.
        const changed=target.step==='payment'&&!travellerReviewCurrent.current;
        const nextStep=changed?'travellers':target.step;
        if(changed)window.history.back();
        const keepFeedback=preserveCheckoutFeedback.current;preserveCheckoutFeedback.current=false;
        setQuote(cached.quote);setCheckoutStep(nextStep);setMessage(current=>changed?'Your details changed. Review them again before payment.':keepFeedback?current:'');scrollToSection('booking-review');return;
      }
      if(product==='FLIGHT'&&quote&&hasFullSearchResults){clearReviewSuccessFeedback();savePrivateDraft();setQuote(null);setCheckoutStep('travellers');setExtrasPending(false);restoreFlightResults.current=true;}
    }
    window.addEventListener('popstate',restoreCheckout);return()=>window.removeEventListener('popstate',restoreCheckout);
    // Handlers read only the currently mounted account/search and payment locks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quote,results,checkoutStep,product,payment,paymentUncertain,recovery.blocked,hasFullSearchResults]);
  async function loadMoreHotels(){
    if(!results||!hotelNextCursor||!submittedSearch.regionId||loadingMoreHotels||busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    const baseSearchId=results.searchId,generation=operation.current;
    const controller=new AbortController();hotelMoreRequest.current=controller;setLoadingMoreHotels(true);setHotelMoreError('');
    try{
      const occupancy=searchRooms(submittedSearch.rooms)??[{adults:Number(submittedSearch.adults)||1,childAge:[]}];
      const completeRooms=completeHotelRooms(occupancy);
      const page=await nextHotelSearchPage(hotelNextCursor,cursor=>api('/api/travel/destination-hotels',{regionId:submittedSearch.regionId,cursor},controller.signal),hotelIds=>api<Results>('/api/travel/search',{product:'HOTEL',hotelIds,checkIn:submittedSearch.date,checkOut:submittedSearch.end,adults:occupancy[0].adults,rooms:completeRooms,childrenAges:completeRooms[0].childAge,nationality:submittedSearch.nationality||'106'},controller.signal));
      if(!mounted.current||controller.signal.aborted||generation!==operation.current)return;
      if(page.result){
        const incoming=page.result;
        setResults(current=>current?.searchId===baseSearchId?{...current,results:{...current.results,hotels:appendHotelSearchPage(current.results.hotels??[],baseSearchId,incoming.results.hotels??[],incoming.searchId)}}:current);
        if(incoming.propertyContentPending){
          // Each optional metadata response belongs to its own search batch.
          void api<{searchId:string;properties:Record<string,HotelPropertyDetails>;propertyContentStatuses?:Record<string,'resolved'|'unavailable'>}>('/api/travel/hotel-content',{searchId:incoming.searchId},AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])).then(content=>{
            if(!mounted.current||controller.signal.aborted)return;
            if(content.searchId!==incoming.searchId)throw Error('Property metadata does not match this search.');
            setResults(current=>current?.searchId===baseSearchId?{...current,results:{...current.results,hotels:current.results.hotels?.map(hotel=>hotel.originSearchId===incoming.searchId?{...hotel,property:content.properties[hotel.tjHotelId]??hotel.property,propertyContentStatus:content.propertyContentStatuses?.[hotel.tjHotelId]??'unavailable'}:hotel)}}:current);
          }).catch(()=>{
            if(!mounted.current||controller.signal.aborted)return;
            setResults(current=>current?.searchId===baseSearchId?{...current,results:{...current.results,hotels:hotelContentUnavailable(current.results.hotels??[],baseSearchId,incoming.searchId)}}:current);
          });
        }
      }
      setHotelNextCursor(page.nextCursor??'');
      if(!page.result)setHotelMoreError(page.nextCursor?'No stays in this batch. Load more to check the next area.':'You have reached the end of this destination.');
    }catch(error){if(mounted.current&&!controller.signal.aborted&&generation===operation.current)setHotelMoreError(error instanceof Error?error.message:'More stays could not be loaded. Try again.');}
    finally{if(mounted.current&&hotelMoreRequest.current===controller)setLoadingMoreHotels(false);}
  }
  async function loadHotelRooms(hotel:Hotel,searchId:string){
    hotelRequest.current?.abort();const controller=new AbortController();hotelRequest.current=controller;
    const generation=++hotelGeneration.current;setRoomsStatus('loading');setRoomsError('');
    try{const detail=await api<{options:HotelOption[];property?:HotelPropertyDetails}>('/api/travel/hotel-detail',{searchId,hid:hotel.tjHotelId},controller.signal);
      if(mounted.current&&generation===hotelGeneration.current){setRooms({searchId,hid:hotel.tjHotelId,name:hotel.name,options:detail.options,property:detail.property??hotel.property});setRoomsStatus('ready');}
    }catch(error){if(mounted.current&&generation===hotelGeneration.current&&!controller.signal.aborted){setRoomsStatus('error');setRoomsError(error instanceof Error?error.message:'Room availability could not be checked. Try again.');if(error instanceof BookingApiError&&[404,409].includes(error.status)&&/search.*(expired|no longer available)|expired.*search/i.test(error.message)){setFreshSearchRequired(true);setMessage(error.message);}}}
  }
  function chooseHotel(hotel:Hotel,trigger:HTMLElement){
    const searchId=hotel.originSearchId??results?.searchId;if(!searchId||busyRef.current||loadingMoreHotels||!dismissSelectionGate())return;
    roomReturn.current={trigger,scrollY:window.scrollY};writeHotelBrowse(searchId,{scrollY:window.scrollY});
    window.history.replaceState(null,'',hotelJourneyUrl(results?.searchId??searchId));
    window.history.pushState({hotelEntry:'detail'},'',hotelJourneyUrl(searchId,hotel.tjHotelId));
    setRooms({searchId,hid:hotel.tjHotelId,name:hotel.name,options:[],property:hotel.property});setRoomView(true);setGalleryOpen(false);setSelectedRoom(null);setMessage('');
    void loadHotelRooms(hotel,searchId);
  }
  function changeHotelGallery(open:boolean){
    if(!rooms)return;
    if(!open&&window.history.state?.hotelEntry==='gallery'){window.history.back();return;}
    window.history[open?'pushState':'replaceState']({hotelEntry:open?'gallery':'detail'},'',hotelJourneyUrl(rooms.searchId,rooms.hid,open));setGalleryOpen(open);
  }
  // Browser history owns the property/gallery steps. Native history is supported by
  // Next and deliberately avoids remounting the mounted results and their filters.
  useEffect(()=>{
    function restore(){
      if(product!=='HOTEL')return;
      const stage=window.history.state?.bookingCheckout,cached=checkoutHistory.current;
      if(cached&&cached.searchId===results?.searchId&&checkoutQuoteIds.current.has(stage?.quoteId)&&['travellers','payment'].includes(stage.step))return;
      const params=new URLSearchParams(window.location.search),id=params.get('stay');
      if(payment||paymentUncertain||recovery.blocked||(busyRef.current&&!checkingSelection)){if(results&&rooms)window.history.replaceState(null,'',hotelJourneyUrl(rooms.searchId,rooms.hid,false,Boolean(quote)));return;}
      if(checkingSelection){++operation.current;requestController.current?.abort();busyRef.current=false;setBusy(false);setActivity('');setCheckingSelection(null);}
      if(quote){clearReviewSuccessFeedback();restoreSelectedRate.current=true;if(checkoutForm.current)privateDraft.current={party:party.join(','),values:Array.from(new FormData(checkoutForm.current).entries()).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[0]!=='consent')};}
      dismissSelectionGate();setQuote(null);setGalleryOpen(params.get('gallery')==='1'&&Boolean(id));
      if(!id){if(results&&params.get('browseSearch')!==results.searchId)window.history.replaceState(null,'',hotelJourneyUrl(results.searchId));restoreRoomReturn.current=true;setRoomView(false);return;}
      const hotel=results?.results.hotels?.find(item=>item.tjHotelId===id);
      const sourceSearchId=hotel?.originSearchId??results?.searchId;
      if(!hotel||!sourceSearchId||params.get('browseSearch')!==sourceSearchId){if(results)window.history.replaceState(null,'',hotelJourneyUrl(results.searchId));setRoomView(false);setGalleryOpen(false);setMessage('This property is not in your current search. Search again to continue.');return;}
      setRoomView(true);
      if(params.get('stayStep')==='review'){window.history.replaceState(null,'',hotelJourneyUrl(sourceSearchId,id));setMessage('Select a room rate to check the current price and conditions again.');}
      if(rooms?.hid!==id||rooms.searchId!==sourceSearchId){setRooms({searchId:sourceSearchId,hid:id,name:hotel.name,options:[],property:hotel.property});void loadHotelRooms(hotel,sourceSearchId);}
    }
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
    // The handler uses the committed search/checkout context, never persisted rates.
    // Party is read only when preserving an already rendered private in-memory draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results,rooms,payment,paymentUncertain,recovery.blocked,checkingSelection,quote,product,signInRequired,signInWithoutSelection,savedHandoff]);
  useEffect(()=>{
    if(snapshotRead.current||prefill.resumeSelection==='1'||!prefill.flightSearch||prefill.searchInvalid)return;
    snapshotRead.current=true;autoSearchStarted.current=true;
    const controller=new AbortController();snapshotController.current=controller;let active=true;const generation=operation.current;
    const timer=setTimeout(()=>{setSnapshotLoading(true);void api<Results&{criteria:Record<string,string>;expiresAt:string}>('/api/travel/flight-search-snapshot',{searchId:prefill.flightSearch},controller.signal).then(snapshot=>{
      if(!active||controller.signal.aborted||generation!==operation.current)return;
      if(snapshot.searchId!==prefill.flightSearch||!Number.isFinite(Date.parse(snapshot.expiresAt))||Date.parse(snapshot.expiresAt)<=Date.now())throw Error('This flight search has expired. Search again for current availability.');
      const criteria=bookingSearchPrefill(snapshot.criteria);
      if(criteria.searchInvalid||criteria.product!=='FLIGHT'||!criteria.from||!criteria.to||!criteria.date||!snapshot.results.searchResult)throw Error('This flight search could not be restored. Search again to continue.');
      const legs=searchLegs(criteria.legs);
      setSubmittedSearch({...criteria,flightSearch:snapshot.searchId});setSearchPrefill(criteria);setProduct('FLIGHT');
      setAdults(initialAdults(criteria.adults));setChildren(Number(criteria.children)||0);setInfants(Number(criteria.infants)||0);setCabin(criteria.cabin||'ECONOMY');setMultiCity(Boolean(legs));setLegCount(legs?.length??2);
      setSearchedSummary(`${criteria.from} → ${criteria.to} · ${travelDateLabel(criteria.date)}${criteria.returnDate?` – ${travelDateLabel(criteria.returnDate)}`:''} · ${Number(criteria.adults)+Number(criteria.children||0)+Number(criteria.infants||0)} travellers`);
      restoreFlightResults.current=true;setResults(snapshot);setHasFullSearchResults(true);
    }).catch(error=>{if(active&&!controller.signal.aborted&&generation===operation.current){setFreshSearchRequired(true);setMessage(error instanceof Error?error.message:'This flight search could not be restored. Search again.');}}).finally(()=>{if(active&&generation===operation.current)setSnapshotLoading(false);});},0);
    return()=>{active=false;controller.abort();clearTimeout(timer);snapshotRead.current=false;};
    // One owned snapshot per route/account boundary; superseded work is discarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(snapshotRead.current||prefill.resumeSelection==='1'||!prefill.browseSearch||prefill.searchInvalid)return;
    snapshotRead.current=true;autoSearchStarted.current=true;
    const controller=new AbortController();snapshotController.current=controller;let active=true;const generation=operation.current;
    const timer=setTimeout(()=>{setSnapshotLoading(true);void api<Results&{criteria:Record<string,string>;expiresAt:string}>('/api/travel/hotel-search-snapshot',{searchId:prefill.browseSearch},controller.signal).then(snapshot=>{
      if(!active||controller.signal.aborted||generation!==operation.current)return;
      if(snapshot.searchId!==prefill.browseSearch||!Number.isFinite(Date.parse(snapshot.expiresAt))||Date.parse(snapshot.expiresAt)<=Date.now())throw Error('This hotel search has expired. Search again for current availability.');
      const criteria:Record<string,string>={...snapshot.criteria,...(prefill.city?{city:prefill.city}:{}),...(prefill.regionId?{regionId:prefill.regionId,destinationCursor:prefill.destinationCursor??''}:{})},occupancy=searchRooms(criteria.rooms)??[{adults:Number(criteria.adults)||1,childAge:[]}];
      setSubmittedSearch(criteria);setSearchPrefill(criteria);setHotelNextCursor(criteria.regionId?'0:0':criteria.destinationCursor??'');setProduct('HOTEL');setHotelOccupancy(occupancy);setResults(snapshot);setHasFullSearchResults(true);
      setHotelStayContext({checkIn:criteria.date,checkOut:criteria.end,rooms:occupancy.length,guests:occupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)});
      setSearchedSummary(`${criteria.city||'Selected destination'} · ${travelDateLabel(criteria.date)} – ${travelDateLabel(criteria.end)} · ${occupancy.length} room${occupancy.length===1?'':'s'} · ${occupancy.reduce((sum,room)=>sum+room.adults+room.childAge.length,0)} guests`);
      const hotel=snapshot.results.hotels?.find(item=>item.tjHotelId===prefill.stay);
      if(prefill.stay&&!hotel){setMessage('This property is not in this search. Choose another stay.');window.history.replaceState(null,'',hotelJourneyUrl(snapshot.searchId));}
      if(hotel){setRooms({searchId:snapshot.searchId,hid:hotel.tjHotelId,name:hotel.name,options:[],property:hotel.property});setRoomView(true);setGalleryOpen(prefill.gallery==='1');void loadHotelRooms(hotel,snapshot.searchId);}
      else restoreRoomReturn.current=true;
      if(prefill.stayStep==='review')setMessage('Your property is restored. Select a room rate to check the latest price and conditions again.');
    }).catch(error=>{if(active&&!controller.signal.aborted&&generation===operation.current){setFreshSearchRequired(true);setMessage(error instanceof Error?error.message:'This search could not be restored. Search again.');}}).finally(()=>{if(active&&generation===operation.current)setSnapshotLoading(false);});},0);
    return()=>{active=false;controller.abort();clearTimeout(timer);snapshotRead.current=false;};
    // Initial route restoration runs once per mounted account identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  function chooseFare(group:string,fare:FlightFare,trigger:HTMLButtonElement){
    flightReturn.current={trigger,scrollY:window.scrollY};
    if(busyRef.current||!dismissSelectionGate())return;
    if(!pairedFares){setSelectedFares({[group]:fare.id});void review({priceIds:[fare.id]});return;}
    flightSelectionFocus.current=fareGroups[fareGroups.indexOf(group)+1]?'results':'review';
    setSelectedFares(previous=>{
      const next={...previous,[group]:fare.id};
      if(group==='ONWARD'&&next.RETURN){const back=selectedFare('RETURN');if(back&&!compatibleReturnPair(fare,back))delete next.RETURN;}
      return next;
    });
    const nextGroup=fareGroups[fareGroups.indexOf(group)+1];
    if(nextGroup){setActiveGroup(nextGroup);setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}
  }
  async function openCheckout(order:Payment){
    if(order.provider==='PAYGLOCAL'){
      if(!isResumableHostedCheckout({...order,canResume:true}))throw Error('Hosted checkout details could not be verified. Check My trips before paying again.');
      setActivity('Redirecting to secure checkout; payment verification follows in My trips');
      window.location.assign(order.checkoutUrl);return;
    }
    const launch=++checkoutLaunch.current;
    setActivity('Loading secure checkout');
    try{
    const Razorpay=await loadRazorpayCheckout();
    if(!mounted.current||launch!==checkoutLaunch.current)return;
    verificationStarted.current=false;
    const checkout=new Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,order_id:order.orderId,name:'Max Travel · Test booking',handler:async result=>{
      verificationStarted.current=true;
      try{await api('/api/payments/verify',{bookingId:order.bookingId,...result});clearCheckoutMarker({bookingId:order.bookingId});if(mounted.current){recovery.clear();router.push(`/my-trips/${encodeURIComponent(order.bookingId)}`);}}
      catch(error){if(mounted.current){setPaymentUncertain(true);setMessage(`${error instanceof Error?error.message:'Payment verification is pending.'} Check My trips before attempting another payment.`);scrollToSection('booking-feedback');}}
      finally{if(mounted.current){busyRef.current=false;setBusy(false);setActivity('');}}
    },modal:{ondismiss:()=>{if(!mounted.current||verificationStarted.current)return;busyRef.current=false;setBusy(false);setActivity('');setMessage('Checkout closed. Your payment order is preserved. Resume the same checkout or check My trips.');scrollToSection('booking-feedback');}}});
    checkout.on('payment.failed',()=>{if(mounted.current&&!verificationStarted.current){busyRef.current=false;setBusy(false);setActivity('');setMessage('This payment attempt failed. Your existing order is preserved; resume the same checkout to retry.');scrollToSection('booking-feedback');}});
    checkout.open();
    setActivity('Complete secure checkout');
    }catch(error){if(mounted.current&&launch===checkoutLaunch.current){
      busyRef.current=false;setBusy(false);setActivity('');
      setMessage(`${error instanceof RazorpayCheckoutLoadError?error.message:'Secure checkout could not open.'} Your existing payment order is preserved. Use Resume secure checkout to try again, or check My trips.`);
      scrollToSection('booking-feedback');
    }}
  }
  function validatedGuests(form:HTMLFormElement){
    if(!quote)return null;
    const values=new FormData(form);
    const guests=guestsFromForm(values,party,quote.product==='HOTEL'?hotelParty.map(person=>person.roomIndex):undefined);
      const issues=guestDetailsIssues(guests,reviewedSearch,quote.review);
      const today=indiaToday();
      const nativeFields=Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('.booking-traveller-fields input, .booking-traveller-fields select, .booking-traveller-fields textarea')).filter(field=>field.willValidate);
      for(const field of nativeFields)if(field instanceof HTMLInputElement&&/^dob-\d+$/.test(field.name))field.max=today;
      // noValidate suppresses only the browser's first-error popup. Retain all
      // required/type/pattern/length/range/step/custom checks, including fields
      // omitted from optional GST/emergency payloads and closed details.
      for(const issue of guestNativeIssues(nativeFields,today))if(!issues.some(existing=>existing.path===issue.path))issues.push(issue);
      if(issues.length){travellerReviewCurrent.current=false;if(window.history.state?.bookingCheckout?.step==='payment'){preserveCheckoutFeedback.current=true;window.history.back();}showGuestErrors(issues);return null;}
      setGuestErrors([]);
    return guests;
  }
  function showPaymentReview(guests:ReturnType<typeof guestsFromForm>,replace=false){
    if(!quote)return;
    setTravellerSummary({names:guests.travellers.map(person=>`${person.ti} ${person.fN} ${person.lN}`),email:guests.email,phone:guests.phone});
    travellerReviewCurrent.current=true;
    if(replace)focusRefreshedTerms.current=true;
    window.history[replace?'replaceState':'pushState'](checkoutHistoryState(quote,'payment'),'',window.location.pathname+window.location.search);
    setCheckoutStep('payment');if(!replace)scrollToSection('booking-review');
  }
  async function submitCheckout(form:HTMLFormElement){
    if(!quote||!checkoutConfigured||providerUnavailable||busy||busyRef.current||refreshedContinuation.current||paymentUncertain||recovery.blocked)return;
    // An expired primary action only refreshes and revalidates. Paying always
    // requires a separate explicit click against the newly displayed total.
    if(quoteRemaining(quote.expiresAt,Date.now())<=0||needsReview){
      if(payment){setMessage('Your reviewed price has expired. Your original order is preserved; check My trips before making another payment.');return;}
      if(selection)await review(selection,true,true);
      return;
    }
    if(extrasPending){setMessage('Apply your flight extras before continuing.');return;}
    const values=new FormData(form);
    // Existing payment recovery uses the original order, never edited draft data.
    const guests=payment?guestsFromForm(values,party,quote.product==='HOTEL'?hotelParty.map(person=>person.roomIndex):undefined):validatedGuests(form);
    if(!guests)return;
    if(checkoutStep==='travellers'){showPaymentReview(guests);return;}
    // An unconfirmed promo total blocks payment, not navigation back to the
    // visible promo controls or a fresh review of an expired quote.
    if(uncertainPromoQuote===quote.quoteId){setMessage('Apply or remove the promo code to confirm your total before paying.');return;}
    if(billingRequired&&!payment){const billing=billingForProduct(quote.product).safeParse(billingFromForm(values));if(!billing.success){setMessage("Complete the payer billing details before opening checkout.");form.querySelector<HTMLInputElement>(".payer-billing input:invalid, .payer-billing select:invalid")?.reportValidity();return;}}
    busyRef.current=true;setBusy(true);setActivity('Opening secure payment');setMessage('');
    try{
      if(payment){
        const response=await fetch(`/api/payments/status?bookingId=${encodeURIComponent(payment.bookingId)}`,{cache:'no-store'});
        const body=await response.json();
        const status=parseCheckoutRecoveryStatus(body);
        if(!response.ok||!status||(!isResumableCheckout(status)&&!isResumableHostedCheckout(status))){setPaymentUncertain(true);throw Error(status?.message||'Your order may already be processing. Check its status in My trips before paying again.');}
        if(Date.parse(quote.expiresAt)<=new Date().getTime())throw Error('This reviewed price has expired. Your original order is preserved; check My trips before making another payment.');
        const verifiedOrder:Payment=isResumableHostedCheckout(status)?status:{bookingId:status.bookingId,orderId:status.orderId,keyId:status.keyId,amount:status.amount,currency:status.currency};
        setPayment(verifiedOrder);await openCheckout(verifiedOrder);return;
      }
      if(!saveCheckoutMarker({quoteId:quote.quoteId}))throw new BookingApiError('Your browser could not preserve checkout recovery. Enable session storage before starting payment.',400);
      const order=await api<Payment>('/api/payments/create',{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor,guests,...(billingRequired?{billingData:billingFromForm(values)}:{})});
      if(!isResumableCheckout({...order,canResume:true})&&!isResumableHostedCheckout({...order,canResume:true}))throw Error('Payment order details could not be verified. The original attempt is preserved.');
      saveCheckoutMarker({quoteId:quote.quoteId,bookingId:order.bookingId});
      if(!mounted.current)return;
      setPayment(order);
      if(quoteRemaining(quote.expiresAt,new Date().getTime())<=0){setPaymentUncertain(true);throw Error('The price review expired while checkout was being prepared. Your original order is preserved.');}
      await openCheckout(order);
    }catch(error){if(mounted.current){
      const failureMessage=error instanceof Error?error.message:'Checkout unavailable.';
      const action=paymentFailureAction(error instanceof BookingApiError?error.status:undefined,failureMessage,error instanceof BookingApiError?error.code:undefined);
      if(action==='status')setPaymentUncertain(true);else clearCheckoutMarker({quoteId:quote.quoteId});
      if(action==='refresh')setNeedsReview(true);
      if(action==='unavailable')setProviderUnavailable(true);
      if(action==='edit'){busyRef.current=false;travellerReviewCurrent.current=false;if(window.history.state?.bookingCheckout?.step==='payment'){preserveCheckoutFeedback.current=true;window.history.back();}setCheckoutStep('travellers');if(error instanceof BookingApiError&&error.fields.length)showGuestErrors(error.fields);}
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
      saveCheckoutMarker({...marker,bookingId:order.bookingId});setPayment(order);await openCheckout(order);
    }catch(error){if(mounted.current){recovery.invalidate();setMessage(error instanceof Error?error.message:'Check the existing payment in My trips.');busyRef.current=false;setBusy(false);setActivity('');}}
  }

  // Enrichment is display-only: never replace the chosen room's live rates or policies.
  // Deriving from matching results also handles content arriving before room detail.
  const roomListing=rooms?.searchId===results?.searchId?results?.results.hotels?.find(hotel=>hotel.tjHotelId===rooms?.hid):undefined;
  const roomProperty=roomListing?.propertyContentStatus==='resolved'?roomListing.property??rooms?.property:rooms?.property??roomListing?.property;
  return <><TravelHeader active={product==='FLIGHT'?'flights':'hotels'}/><main id="main-content" className={`page-shell live-booking booking-workflow journey-flow${results||quote?' has-journey':''}${!checkoutStarted?' booking-shopping':' checkout-active'}${busy&&activity==='Finding available journeys'?' is-searching':''}${product==='HOTEL'&&results&&!checkoutStarted?' hotel-results-page':''}${product==='FLIGHT'&&results&&!checkoutStarted?' flight-results-page':''}${results&&!checkoutStarted?' results-only':''}`}>
    <Link href="/" className="back">← Back to explore</Link>
    {busy&&activity==='Finding available journeys'&&<SearchJourneyPending product={product} context={pendingSearchContext} onStop={stopAvailabilitySearch}/>}
    {busy&&activity!=='Finding available journeys'&&!checkingSelection&&!checkingHotelId&&<section id="booking-pending" className="booking-skeleton booking-pending" role="status" aria-live="polite" aria-label="Search and booking activity"><span aria-hidden="true" className="booking-spinner"/><strong>{activity}…</strong><p>{activity==='Finding available journeys'?'Waiting for live supplier availability. Results will appear here when the response arrives; prices are not confirmed yet.':'We’re checking the details. Please wait before trying again.'}</p><div className="booking-loading-lines" aria-hidden="true"><i/><i/><i/></div></section>}
    {snapshotLoading&&<section className="white-card" role="status"><h2>Restoring your {product==='FLIGHT'?'flight':'hotel'} search…</h2><p>Checking this browser’s search and dates. No booking is being made.</p></section>}
    <div className="page-heading booking-intro"><div className="booking-heading-copy"><span className="booking-heading-icon" aria-hidden="true"><TravelIcon name={product === "FLIGHT" ? "plane" : "hotel"} size={26}/></span><div><><h1>{checkoutStarted?(quote&&checkoutStep==='payment'?'Review & pay':product==='HOTEL'?'Guest details':'Traveller details'):results?(product==='FLIGHT'?'Choose your flight':roomView?'Choose your room':'Choose your stay'):(product==='FLIGHT'?'Your next journey starts here.':'Find your somewhere special.')}</h1>{!results&&!quote&&<p>{product==='FLIGHT'?'Compare flights, make it yours, and review every detail before you pay.':'Discover stays, compare room options, and see the full stay total.'}</p>}</></div></div><span className="booking-test-badge">In Testing · No live bookings or payments</span></div>
    {!checkoutConfigured&&<section className="booking-status info-message booking-availability-notice" aria-label="Online payment availability"><h2>Online payment is currently unavailable.</h2><p>Explore options and compare terms, but you cannot complete a booking here. Traveller details and new payments are disabled.</p><Link className="inline-link" href="/customer-support">Contact Max Travel for booking help →</Link></section>}
    <ol className="booking-progress" aria-label="Booking progress">{[product==='HOTEL'?'Choose stay':'Choose flight',product==='HOTEL'?'Guests':'Travellers',checkoutConfigured?'Review & pay':'Review selection'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={index<step?'is-complete':index===step?'is-current':''}><span aria-hidden="true">{index<step?'✓':index+1}</span>{label}</li>)}</ol>
    <div className="booking-layout"><div className="booking-main">
      {recovery.checking&&<div className="booking-status info-message" role="status">Checking for an interrupted checkout…</div>}
      {recovery.pending&&<section className="white-card booking-recovery" aria-label="Interrupted checkout"><div className="eyebrow">LET’S PICK UP SAFELY</div><h2>Your previous checkout needs a look.</h2><p role="status">{recovery.message}</p><p className="muted">We have paused new payments so you do not accidentally pay twice. No traveller or contact details are saved in this browser.</p>{recovery.status&&(isResumableCheckout(recovery.status)||isResumableHostedCheckout(recovery.status))&&<button type="button" className="primary" disabled={busy||recovery.checking} onClick={()=>void resumeInterrupted()}>Resume existing checkout · {money(recovery.status.amount)}</button>}<button type="button" className="secondary" disabled={busy||recovery.checking} onClick={()=>{if(recovery.pending)void recovery.reconcile(recovery.pending);}}>Check payment status again</button><Link className="secondary" href="/my-trips">Open My trips</Link>{/sign in/i.test(recovery.message)&&<Link className="inline-link" href={accountHref('/book?'+new URLSearchParams(submittedSearch).toString())}>Sign in to check your payment</Link>}</section>}
      {!recovery.pending&&recovery.message&&<p className="info-message" role="status">{recovery.message} <Link href="/my-trips">My trips →</Link></p>}
      {!results&&!quote&&<div className="account-tabs booking-product-tabs" aria-label="Booking product"><button type="button" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} aria-pressed={product==='FLIGHT'} onClick={()=>switchProduct('FLIGHT')}>✈ Flights</button><button type="button" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} aria-pressed={product==='HOTEL'} onClick={()=>switchProduct('HOTEL')}>▤ Stays</button></div>}
      {searchRecovery&&<section id="booking-search-recovery" tabIndex={-1} className="info-message" role="status"><h2>Search again to compare options</h2><p>Previous search results are not available in this tab. Search again to compare other options.</p><p>Your search criteria are kept below. No new availability request is made until you search.</p></section>}
      <details id="booking-search" className="booking-search-panel" hidden={checkoutStarted} open={!results&&!quote} onToggle={event=>focusOpenedSearch(event.currentTarget)}><summary><span className="search-panel-icon" aria-hidden="true">⌕</span>{results||quote?<><span>{searchedSummary||`${summaryTitle}${quote?.summary?.date?` · ${travelDateLabel(quote.summary.date)}`:''}`}</span><small className="search-edit-label">Modify search</small></>:'Where would you like to go?'}</summary>
      <form key={JSON.stringify(searchPrefill)} ref={searchForm} onChange={()=>{if(searchValidation){setMessage('');setSearchValidation(false);}}} aria-label="Search availability" className="white-card live-search" onSubmit={event=>{event.preventDefault();void search(event.currentTarget);}}>
        <fieldset className="live-search-controls" disabled={busy||Boolean(quote)||Boolean(payment)||paymentUncertain||recovery.blocked}>
          {product==='FLIGHT'&&<label>Journey type<select value={multiCity?'MULTI':'STANDARD'} onChange={event=>{setMultiCity(event.target.value==='MULTI');setResults(null);setSelectedFares({});}}><option value="STANDARD">One-way / return</option><option value="MULTI">Multi-city</option></select></label>}
          <div className="form-row">{product==='FLIGHT'?<><AirportPicker name="from" label="From airport" initialCode={searchPrefill.from||'BOM'}/><AirportPicker name="to" label="To airport" initialCode={searchPrefill.to||'DEL'}/></>:<><HotelDestination initialQuery={searchPrefill.city||''} initialHotelIds={parseHotelIds(searchPrefill.hotelIds)} initialRegionId={searchPrefill.regionId} initialDestinationCursor={searchPrefill.destinationCursor}/><NationalitySelect initialValue={/^\d+$/.test(searchPrefill.nationality??'')?searchPrefill.nationality:'106'}/></>}</div>
          <div className="form-row"><label>{product==='FLIGHT'?'Departure':'Check-in'}<input name="date" required type="date" min={indiaToday()} defaultValue={searchPrefill.date}/></label>{product==='HOTEL'&&<label>Check-out<input name="end" required type="date" min={indiaToday()} defaultValue={searchPrefill.end}/></label>}{product==='FLIGHT'&&!multiCity&&<label>Return date, optional<input name="returnDate" type="date" min={indiaToday()} defaultValue={searchPrefill.returnDate}/></label>}</div>
          {product==='FLIGHT'?<details className="booking-party-picker"><summary><span><strong>Travellers & cabin</strong><small>{adults} adult{adults===1?'':'s'}{children?` · ${children} child${children===1?'':'ren'}`:''}{infants?` · ${infants} infant${infants===1?'':'s'}`:''} · {cabin==='PREMIUM_ECONOMY'?'Premium economy':cabin.charAt(0)+cabin.slice(1).toLowerCase()}</small></span><span className="party-edit">Edit</span></summary><div className="form-row"><label>Adults<select value={adults} onChange={event=>{const count=Number(event.target.value);setAdults(count);setInfants(value=>Math.min(value,count));}}>{[1,2,3,4,5,6,7,8,9].map(count=><option key={count}>{count}</option>)}</select></label><label>Children · age 2–11<select value={children} onChange={event=>setChildren(Number(event.target.value))}>{[0,1,2,3,4,5,6,7,8].map(count=><option key={count}>{count}</option>)}</select></label><label>Infants · under 2<select value={infants} onChange={event=>setInfants(Number(event.target.value))}>{Array.from({length:adults+1},(_,count)=><option key={count}>{count}</option>)}</select></label><label>Cabin<select name="cabin" value={cabin} onChange={event=>setCabin(event.target.value)}><option value="ECONOMY">Economy</option><option value="PREMIUM_ECONOMY">Premium economy</option><option value="BUSINESS">Business</option><option value="FIRST">First</option></select></label></div><p className="muted">Children are aged 2–11. Each infant under 2 must travel with an adult.</p></details>:<><label>Rooms<select value={hotelOccupancy.length} onChange={event=>{const count=Number(event.target.value);setHotelOccupancy(current=>Array.from({length:count},(_,index)=>current[index]??{adults:2,childAge:[]}));}}>{[1,2,3,4].map(count=><option key={count}>{count}</option>)}</select></label>{hotelOccupancy.map((room,roomIndex)=><fieldset key={roomIndex}><legend>Room {roomIndex+1} · Guests</legend><div className="form-row"><label>Adults<select value={room.adults} onChange={event=>setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,adults:Number(event.target.value)}:value))}>{[1,2,3,4].map(count=><option key={count}>{count}</option>)}</select></label><label>Children<select value={room.childAge.length} onChange={event=>{const count=Number(event.target.value);setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,childAge:Array.from({length:count},(_,child)=>value.childAge[child]??'')}:value));}}>{[0,1,2,3].map(count=><option key={count}>{count}</option>)}</select></label>{room.childAge.map((age,childIndex)=><label key={childIndex}>Child {childIndex+1} age at check-in<input type="number" required min={0} max={17} value={age} onChange={event=>setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,childAge:value.childAge.map((child,i)=>i===childIndex?(event.target.value===''?'':Number(event.target.value)):child)}:value))}/></label>)}</div></fieldset>)}</>}
          {product==='FLIGHT'&&multiCity&&<div className="multi-city-legs">{Array.from({length:legCount-1},(_,index)=><fieldset key={index}><legend>Flight {index+2}</legend><div className="form-row"><AirportPicker name={`leg-from-${index+1}`} label="From airport" initialCode={restoredLegs?.[index+1]?.from??''}/><AirportPicker name={`leg-to-${index+1}`} label="To airport" initialCode={restoredLegs?.[index+1]?.to??''}/><label>Departure<input name={`leg-date-${index+1}`} defaultValue={restoredLegs?.[index+1]?.date} type="date" min={indiaToday()} required/></label></div></fieldset>)}<button className="secondary" type="button" disabled={legCount>=6} onClick={()=>setLegCount(value=>value+1)}>+ Add flight</button>{legCount>2&&<button className="secondary" type="button" onClick={()=>setLegCount(value=>value-1)}>Remove last flight</button>}</div>}
          <p className="muted search-footnote">{product==='FLIGHT'?'Up to 9 adults and children, plus infants. All results show the estimated total for all travellers.':'Set guests for each room. Child ages must match their dates of birth at check-in.'}</p><button className="primary booking-search-submit" disabled={busy}>{busy?'Checking availability…':product==='FLIGHT'?'Search flights':'Search stays'}</button>
        </fieldset>{quote&&<p className="muted">To edit your search, return to your selection first.</p>}
      </form></details>
      {busy&&verificationSelection&&checkingSelection&&<section className="white-card" role="status"><h2>Checking your selected {product==='HOTEL'?'room':'flight'}</h2><p>Your sign-in is verified. We’re confirming the latest price and availability.</p></section>}
      {verificationActive&&<section className="white-card checkout-verification-stage" aria-labelledby="booking-signin-title">
        <h2 id="booking-signin-title" tabIndex={-1}>{product==='HOTEL'?'Continue to guest details':'Continue to traveller details'}</h2>
        <div className="booking-verification-summary signin-selection-context"><strong>{product==='HOTEL'?rooms?.name||savedHandoff?.hotel?.name||'Selected stay':'Your selected flight'}</strong><p>{product==='HOTEL'?(savedHandoff?.hotel?.roomLabel||hotelRoomLabel({roomInfo:selectedRoom?.roomInfo??[]})):selectedJourney.map(flight=>flight.sI[0]?.da.code+' → '+flight.sI.at(-1)?.aa.code+' · '+travelDateTimeLabel(flight.sI[0]?.dt)).join(' / ')}</p>{product==='FLIGHT'&&<p>Selected fare: {selectedJourney.flatMap(flight=>flight.totalPriceList.map(fare=>fareDecisionName(fare))).join(' / ')}</p>}{product==='HOTEL'&&(selectedRoom?.mealBasis||savedHandoff?.hotel?.mealBasis)&&<p>{(selectedRoom?.mealBasis||savedHandoff?.hotel?.mealBasis)?.replaceAll('_',' ')}</p>}{selectedEstimate!==null&&<p className="booking-verification-estimate"><strong>{money(selectedEstimate)}</strong> estimated {product==='HOTEL'?'stay total':'total for all travellers'}</p>}<p className="muted">Your choice stays here. We’ll confirm the latest price and availability before you enter traveller details.</p></div>
        <CheckoutVerification initialEmail={customerEmail(checkoutSession?.user)} initialPhoneNumber={checkoutSession?.user.phoneNumber??undefined} onVerified={continueVerifiedSelection}/>
        <div className="booking-verification-actions"><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{if(product==='HOTEL')returnToRoomOptions();else backToFlightResults();}}>{product==='HOTEL'?'Back to room options':'Back to flights'}</button></div>
      </section>}
      <div id="booking-feedback" tabIndex={-1}>{message&&!verificationActive&&<div className="booking-status info-message" role="alert" tabIndex={-1}>
        <p>{message}</p>{hotelReviewFailed&&rooms&&!quote&&<div className="hotel-review-recovery"><p>Choose another room or refresh the available options. Your search details are kept.</p><button type="button" className="secondary" disabled={busy} onClick={()=>{setHotelReviewFailed(false);setMessage('');void loadHotelRooms({tjHotelId:rooms.hid,name:rooms.name,property:roomProperty},rooms.searchId);}}>Refresh room options</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setHotelReviewFailed(false);setMessage('');backToStays();}}>Browse other stays</button></div>}
        {!signInRequired&&/sign in/i.test(message)&&<Link className={signInWithoutSelection?"primary signin-search-again":"inline-link"} href={accountHref('/book?'+new URLSearchParams(Object.fromEntries(Object.entries(submittedSearch).filter(([key])=>!signInWithoutSelection||!['resumeSelection','resumeReview','selectionKey','autoSearch'].includes(key)))).toString())}>{signInWithoutSelection?'Sign in, then search again':'Sign in or create an account'}</Link>}
        {freshSearchRequired&&!payment&&!paymentUncertain&&<button className="secondary" type="button" disabled={busy||recovery.blocked} onClick={recoverSearch}>Start a fresh search</button>}{(payment||paymentUncertain)&&<Link className="inline-link" href="/my-trips">View payment and booking status →</Link>}
      </div>}</div>

      {results&&!hasFullSearchResults&&!quote&&!signInRequired&&<section id="saved-selection-recovery" tabIndex={-1} className="white-card saved-selection-recovery" aria-label="Saved selection"><h2>Your saved selection</h2><p>This tab has your selected option, not the complete previous search results. No price or availability is confirmed; nothing is reserved. For privacy, traveller and contact details must be entered again after a reload.</p>{product==='FLIGHT'?selectedJourney.map((flight,index)=><div key={index}><h3>{flight.sI[0]?.da.code} → {flight.sI.at(-1)?.aa.code}</h3><p>{flight.sI[0]?.fD.aI.name} · {travelDateTimeLabel(flight.sI[0]?.dt)}</p><p>Selected fare: {flight.totalPriceList.map(fare=>fareDecisionName(fare)).join(' / ')}</p></div>):savedHandoff?.hotel&&<div><h3>{savedHandoff.hotel.name}</h3><p>{savedHandoff.hotel.roomLabel}</p>{savedHandoff.hotel.mealBasis&&<p>{savedHandoff.hotel.mealBasis.replaceAll('_',' ')}</p>}</div>}{busy&&checkingSelection?<p role="status">Checking the current price and conditions… Nothing is reserved yet.</p>:resumeSelection&&!hasVerifiedCustomerIdentity(checkoutSession?.user)?<><p>Continue with your email to check the latest price and availability.</p><CheckoutVerification initialEmail={checkoutSession?.user.email} onVerified={continueVerifiedSelection}/></>:<>{savedHandoff&&<button type="button" className="primary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>void review(savedHandoff.selection)}>Check current price and conditions</button>}<p>To compare other options, search again using your retained criteria.</p></>}<button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={recoverSearch}>Search again</button></section>}

      {results&&hasFullSearchResults&&<section id="booking-results" className="live-results" hidden={checkoutStarted||(product==='HOTEL'&&roomView)} aria-label="Available options" aria-busy={busy}>
        {product==='FLIGHT'&&<div className="results-heading"><div><h2 id="flight-results-title" tabIndex={-1}>{pairedFares?`Choose your ${groupLabel(shownGroup).toLowerCase()} flight`:'Available flights'}</h2><p className="muted">Compare fares, baggage and flexibility.</p></div><div className="flight-sort-options" role="group" aria-label="Sort flights">{flightSortOptions.map(option=><button type="button" key={option.value} aria-pressed={effectiveSort===option.value} disabled={busy||option.disabled} title={option.description} onClick={()=>setSortBy(option.value)}>{option.label}</button>)}</div><span className="results-count" role="status" aria-live="polite">{flightRows.length} of {(groups[shownGroup]??[]).length} options · {groupLabel(shownGroup||'')}</span></div>}
        {product==='FLIGHT'&&<>
          {pairedFares&&<div className="flight-group-tabs" aria-label="Choose each flight">{fareGroups.map(group=><button type="button" key={group} className={shownGroup===group?'is-active':''} aria-pressed={shownGroup===group} disabled={busy} onClick={()=>{setActiveGroup(group);setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}}>{groupLabel(group)} {selectedFares[group]?'✓':''}</button>)}</div>}
          {pairedFares&&<FlightSelectionSummary groups={fareGroups.map(group=>{const fare=selectedFare(group);return {group,fare,flight:groups[group]?.find(item=>item.totalPriceList.some(option=>option.id===fare?.id))};})} activeGroup={shownGroup} busy={busy} checking={Boolean(busy&&checkingSelection)} allSelected={allSelected} onChange={group=>{setActiveGroup(group);setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}} onReview={()=>void review({priceIds:fareGroups.map(group=>selectedFares[group])})}/>}
          {!submittedSearch.legs&&<nav className="nearby-flight-dates" aria-label="Nearby departure dates"><button type="button" className="secondary" disabled={busy||!previousFlightDate||recovery.blocked} onClick={()=>{if(previousFlightDate)router.push(previousFlightDate.url);}}>← Previous day{previousFlightDate&&<small>{travelDateLabel(previousFlightDate.date)}</small>}</button><div><strong>{travelDateLabel(submittedSearch.date)}</strong><small>{submittedSearch.returnDate?`Return stays ${travelDateLabel(submittedSearch.returnDate)}`:'Search nearby dates for live fares'}</small></div><button type="button" className="secondary" disabled={busy||!nextFlightDate||recovery.blocked} onClick={()=>{if(nextFlightDate)router.push(nextFlightDate.url);}}>Next day →{nextFlightDate&&<small>{travelDateLabel(nextFlightDate.date)}</small>}</button></nav>}
          <div className="flight-shopping">
          {!checkoutStarted&&<FlightResultsControls sort={effectiveSort} onSort={setSortBy} hasDuration={hasKnownDuration} hasDeparture={hasKnownDeparture} group={shownGroup} airlines={airlines} airline={airlineFilter} onAirline={setAirlineFilter} stops={stopFilter} onStops={setStopFilter} departure={departureWindow} onDeparture={setDepartureWindow} budget={flightBudget} onBudget={setFlightBudget} count={flightRows.length} disabled={busy}/>}
          <div className="flight-shopping-list">{(stopFilter!=='ALL'||airlineFilter!=='ALL'||departureWindow!=='ALL'||flightBudget)&&<div className="flight-applied-filters" aria-label="Active flight filters">{airlineFilter!=='ALL'&&<span>{airlineFilter}</span>}{stopFilter!=='ALL'&&<span>{stopFilter==='0'?'Non-stop':`${stopFilter} stop${stopFilter==='1'?'':'s'}`}</span>}{departureWindow!=='ALL'&&<span>{({EARLY:'Before 06:00',MORNING:'06:00–11:59',AFTERNOON:'12:00–17:59',EVENING:'18:00–23:59'} as Record<string,string>)[departureWindow]}</span>}{flightBudget&&<span>Up to ₹{flightBudget} · all travellers</span>}</div>}
          <FlightResultShortcuts flights={flightRows} group={shownGroup} isCompatible={compatibleFare} sortBy={effectiveSort} nonstop={stopFilter==='0'} onSort={setSortBy} onToggleNonstop={()=>{setStopFilter(stopFilter==='0'?'ALL':'0');setSortBy('price');}} disabled={busy}/>
          {flightRows.length>0&&shownGroup!=='COMBO'&&<FlightResultColumns/>}
          {visibleFlightRows.map((flight,index)=><BookingFlightCard key={`${shownGroup}-${flight.totalPriceList[0]?.id??index}`} flight={flight} group={shownGroup} selectionMode={pairedFares?'leg':'review'} busy={busy} checkingFareId={checkingSelection?.priceIds?.find(id=>flight.totalPriceList.some(fare=>fare.id===id))} selectedFareId={selectedFares[shownGroup]} onSelect={(fare,trigger)=>chooseFare(shownGroup,fare,trigger)} isCompatible={compatibleFare}/>)}
          {flightRows.length>flightShown&&<div className="flight-load-more"><p className="muted" role="status">Showing {Math.min(flightShown,flightRows.length)} of {flightRows.length} flights</p><button type="button" className="secondary" onClick={()=>setFlightLimit({key:flightListKey,count:flightShown+FLIGHT_PAGE})}>Show {Math.min(FLIGHT_PAGE,flightRows.length-flightShown)} more flights</button></div>}
          {!flightRows.length&&<div className="empty-results"><h3>{fareGroups.length?'No flights match these filters':'No flights found for these airports'}</h3><p>{fareGroups.length?'Try another airline or stop filter to see more journeys.':'Try a different date, route or cabin.'}</p>{fareGroups.length>0&&<button className="secondary" type="button" onClick={()=>{setStopFilter('ALL');setAirlineFilter('ALL');setDepartureWindow('ALL');setFlightBudget('');}}>Reset filters</button>}</div>}
          </div></div>
        </>}
        {product==='HOTEL'&&<HotelResults active={!checkoutStarted&&!roomView} key={results.searchId} hotels={results.results.hotels??[]} context={hotelStayContext} checkingHotelId={checkingHotelId} metadataStatus={results.propertyContentPending?'loading':results.propertyContentUnavailable||results.results.hotels?.some(hotel=>hotel.propertyContentStatus==='unavailable')?'unavailable':'ready'} busy={busy||loadingMoreHotels} searchId={results.searchId} hasMore={Boolean(submittedSearch.regionId&&hotelNextCursor)} loadingMore={loadingMoreHotels} loadMoreError={hotelMoreError} onLoadMore={()=>void loadMoreHotels()} onChoose={chooseHotel}/>}
      </section>}
      {rooms&&roomView&&!checkoutStarted&&product==='HOTEL'&&<HotelDetailView name={rooms.name} options={rooms.options} property={roomProperty} context={hotelStayContext} metadataStatus={roomListing?.propertyContentStatus==='pending'?'loading':roomListing?.propertyContentStatus==='unavailable'?'unavailable':'ready'} roomsStatus={roomsStatus} roomsError={roomsError} onRetry={()=>void loadHotelRooms({tjHotelId:rooms.hid,name:rooms.name,property:roomProperty},rooms.searchId)} galleryOpen={galleryOpen} onGalleryChange={changeHotelGallery} busy={busy} checkingOptionId={checkingSelection?.optionId} selectedOptionId={selectedRoom?.optionId} now={now} onBack={backToStays} onReview={optionId=>void review({hid:rooms.hid,optionId})}/>}
      {quote&&<form ref={checkoutForm} noValidate id="booking-review" aria-label="Review and travellers" className={`white-card booking-review${checkoutStep==='payment'?' is-payment-review':''}`} onSubmit={event=>{event.preventDefault();void submitCheckout(event.currentTarget);}}>
        <div className="page-heading"><div>{checkoutStep==='payment'&&<div className="eyebrow">ONE LAST LOOK</div>}<h2 id="booking-review-title" tabIndex={-1}>{!checkoutConfigured?'Your reviewed selection':checkoutStep==='payment'?'Review your booking':'Who’s coming along?'}</h2>{quote.product==='FLIGHT'&&!selectedJourney.some(flight=>flight.sI.length)&&<h3>{summaryTitle}</h3>}<p>{travelDateLabel(quote.summary?.date||quote.summary?.checkIn)}{(quote.summary?.returnDate||quote.summary?.checkOut)?` — ${travelDateLabel(quote.summary?.returnDate||quote.summary?.checkOut)}`:''} · {party.length} traveller{party.length===1?'':'s'}{quote.product==='HOTEL'?` · ${reviewedRooms.length} room${reviewedRooms.length===1?'':'s'}`:''}</p></div><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={changeSelection}>Change selection</button></div>
        {!checkoutConfigured&&<section className="review-unavailable" aria-label="Payment unavailable"><h3>Payment unavailable</h3><p>This selection has been reviewed, but no booking has been made. Online payment and traveller entry are disabled.</p><div><button type="button" className="primary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{setQuote(null);setExtrasPending(false);if(product==='HOTEL')backToStays();else backToFlightResults();}}>Back to results</button><Link className="secondary" href="/customer-support">Contact MaxTravel</Link></div></section>}
        {previousReview&&<RefreshedTerms before={previousReview} after={quote}/>}
        <SelectedJourneyReceipt flights={selectedJourney} totalMinor={quote.totalMinor} hotel={quote.product==='HOTEL'?{name:quote.hotelName||rooms?.name||savedHandoff?.hotel?.name||'Selected stay',room:hotelRoomLabel({roomInfo:quote.review.option?.roomInfo??selectedRoom?.roomInfo??[]}),meal:(quote.review.option?.mealBasis??selectedRoom?.mealBasis)?.replaceAll('_',' ')||'Meal plan not supplied',cancellation:hotelCancellationLabel(quote.review.option?.cancellation,now??undefined)}:undefined}><h3>{quote.product==='FLIGHT'?'Your selected flights':'Your selected room'}</h3>{quote.product==='FLIGHT'?selectedJourney.map((flight,index)=><BookingFlightCard key={index} flight={flight} group="COMBO" busy={true} readOnly onSelect={()=>{}} selectedFareId={flight.totalPriceList[0]?.id}/>):<><p>{quote.hotelName||rooms?.name||savedHandoff?.hotel?.name||'Selected stay'}</p><h4>{hotelRoomLabel({roomInfo:quote.review.option?.roomInfo??selectedRoom?.roomInfo??[]})}</h4>{Boolean((quote.review.option?.inclusions??selectedRoom?.inclusions)?.length)&&<ul>{(quote.review.option?.inclusions??selectedRoom?.inclusions)?.map(item=><li key={item}>{item}</li>)}</ul>}<p>{(quote.review.option?.mealBasis??selectedRoom?.mealBasis)?.replaceAll('_',' ')||'Meal plan not supplied'}</p>{selectedRoom?.bookingNotes&&<p>{selectedRoom.bookingNotes}</p>}</>}<p className="muted">Search details are shown for your selection. The latest reviewed price and supplier conditions below take precedence.</p></SelectedJourneyReceipt>
        {quote.product==='FLIGHT'&&<p className="checkout-cancellation-note">{cancellationNeedsAttention?'Cancellation terms need checking before payment.':'Cancellation fees and timing follow the supplier rules.'} <button className="inline-link" type="button" onClick={()=>{const conditions=document.getElementById('booking-fare-conditions');if(conditions instanceof HTMLDetailsElement){conditions.open=true;conditions.querySelector('summary')?.focus();conditions.scrollIntoView({behavior:'smooth',block:'start'});}}}>View cancellation rules</button></p>}
        <div className={`booking-expiry${expired||needsReview?' is-expired':''}`} role={expired||needsReview?'alert':undefined}><div><strong>{payment?'Payment order created':expired||needsReview?'We’ll check the latest price when you continue':`Price reviewed · ${remaining===null?'checking validity':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`}`}</strong><p>{payment?'Your original order is preserved. Check My trips if your payment status is unclear.':expired||needsReview?'Your details are kept. You’ll see any changes before choosing Agree & pay.':'We’ll check the price again if needed before payment.'}</p></div>{busy&&checkingSelection&&<p role="status">Checking the latest price and rules… Please wait before continuing.</p>}{!payment&&!paymentUncertain&&selection&&<button type="button" className="secondary" disabled={busy} onClick={()=>void review(selection,true)}>{busy&&checkingSelection?'Checking current price…':'Refresh reviewed price'}</button>}</div>
        <details id="booking-fare-conditions" className="review-conditions" open={cancellationNeedsAttention}><summary>Fare conditions, cancellation & documents</summary>{hasCancellationTerms?(quote.product==='HOTEL'&&quote.review.option?.cancellation?<HotelCancellationTimeline value={quote.review.option.cancellation}/>:<SupplierPolicy title="Cancellation and fare rules" value={cancellationTerms}/>):<section className="supplier-policy" aria-label="Cancellation and fare rules"><h4>Cancellation and fare rules</h4><p className="policy-note">Cancellation terms unavailable. Do not assume this fare is refundable. Contact support for the terms before paying.</p></section>}<section className="supplier-policy" aria-label="Required booking details"><h4>Required booking details</h4>{requiredBookingDetails.length?<ul className="fare-features">{requiredBookingDetails.map(detail=><li key={detail}>{detail}</li>)}</ul>:<p className="policy-note">No additional documents are requested in this review. Traveller names must match their travel documents.</p>}</section></details>
        {Boolean(quote.review.alerts)&&<div className="info-message"><strong>Supplier update</strong><SupplierPolicy title="Review these fare alerts" value={quote.review.alerts}/></div>}
        {checkoutStep==='travellers'&&guestErrors.length>0&&<section id="traveller-errors" className="guest-error-summary" role="alert" aria-labelledby="traveller-errors-title" tabIndex={-1}><h3 id="traveller-errors-title">Check these details before review</h3><p>Your entries are kept. Correct the highlighted fields, then review again.</p><ul>{guestErrors.map((issue,index)=><li key={`${issue.path}:${index}`}><button type="button" onClick={()=>focusGuestIssue(issue)}>{guestIssueLabel(issue)}: {issue.message}</button></li>)}</ul></section>}
        <fieldset id="booking-traveller-details" className="booking-traveller-fields" onChange={()=>{travellerReviewCurrent.current=false;}} disabled={!checkoutConfigured||busy||Boolean(payment)||paymentUncertain||recovery.blocked} hidden={!checkoutConfigured||checkoutStep==='payment'}>
          {party.map((pt,index)=>{
            const dobRequired=pt!=='ADULT'||Boolean(quote.review.conditions?.dob?.adobr);
            const panRequired=panRequiredForTraveller(quote.review,quote.product==='HOTEL'?hotelParty:party.map(pt=>({pt})),index);
            const passportField=<label>Passport number{passportRequired?'':' (optional)'}<input {...fieldProps(`passport-${index}`)} name={`passport-${index}`} required={passportRequired} maxLength={30} autoComplete="off"/>{fieldError(`passport-${index}`)}</label>;
            const expiryField=<label>Passport expiry{expiryRequired?'':' (optional)'}<input {...fieldProps(`expiry-${index}`)} name={`expiry-${index}`} required={expiryRequired} type="date"/>{fieldError(`expiry-${index}`)}</label>;
            const nationalityField=<label>Passport nationality · 2-letter code<input {...fieldProps(`nationality-${index}`)} name={`nationality-${index}`} required={passportRequired} pattern="[A-Za-z]{2}" maxLength={2} placeholder="IN"/>{fieldError(`nationality-${index}`)}</label>;
            const panField=pt==='ADULT'?<label>PAN{panRequired?'':' (optional)'}<input {...fieldProps(`pan-${index}`,`pan-hint-${index}`)} name={`pan-${index}`} onChange={event=>{if(event.currentTarget.validity.valid)setGuestErrors(current=>current.filter(issue=>guestIssueField(issue.path).name!==`pan-${index}`));}} required={panRequired} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" maxLength={10} autoComplete="off" autoCapitalize="characters" spellCheck={false}/><small id={`pan-hint-${index}`} className="document-field-hint">{panRequired?quote.product==='HOTEL'?'This room rate requires PAN for the primary guest only.':'The airline requires PAN for this fare.':'Leave blank if you don’t wish to add it.'}</small>{fieldError(`pan-${index}`)}</label>:null;
            const documentFields=[{key:"passport",required:passportRequired,field:passportField},{key:"expiry",required:expiryRequired,field:expiryField},{key:"nationality",required:passportRequired,field:nationalityField},{key:"pan",required:panRequired,field:panField}].filter(item=>item.field);
            return <fieldset key={index} className="traveller-card"><legend>{quote.product==='HOTEL'?`Room ${hotelParty[index].roomIndex+1} · `:''}{pt==='ADULT'?'Adult':pt==='CHILD'?'Child':'Infant'} {index+1}</legend><p className="muted">Enter the name exactly as shown on the travel document.</p><SavedProfileFill index={index} type={pt}/><div className="form-row traveller-identity"><label>Title<select {...fieldProps(`title-${index}`)} name={`title-${index}`} defaultValue={pt==='ADULT'?'Mr':'Master'}><option>Mr</option><option>Ms</option><option>Mrs</option><option>Master</option><option>Miss</option></select>{fieldError(`title-${index}`)}</label><label>First name<input {...fieldProps(`first-${index}`)} name={`first-${index}`} required maxLength={80} autoComplete="given-name"/>{fieldError(`first-${index}`)}</label><label>Last name<input {...fieldProps(`last-${index}`)} name={`last-${index}`} required maxLength={80} autoComplete="family-name"/>{fieldError(`last-${index}`)}</label>{dobRequired&&<label>Date of birth<input {...fieldProps(`dob-${index}`)} name={`dob-${index}`} type="date" max={indiaToday()} required/>{fieldError(`dob-${index}`)}</label>}</div>{!dobRequired&&<details><summary>Add date of birth (optional)</summary><label>Date of birth<input {...fieldProps(`dob-${index}`)} name={`dob-${index}`} type="date" max={indiaToday()}/>{fieldError(`dob-${index}`)}</label></details>}{documentFields.some(item=>item.required)&&<div className="required-documents"><h4>Required for this booking</h4><div className="form-row">{documentFields.filter(item=>item.required).map(item=><div className="document-field" key={item.key}>{item.field}</div>)}</div></div>}{documentFields.some(item=>!item.required)&&<details><summary>Travel documents (optional for this fare)</summary><div className="form-row">{documentFields.filter(item=>!item.required).map(item=><div className="document-field" key={item.key}>{item.field}</div>)}</div></details>}</fieldset>;
          })}
          <section id="booking-contact-details" className="booking-contact"><h3>Where should we send your trip details?</h3><p className="muted">Booking updates and confirmation will go to these contact details.</p><div className="form-row"><label>Email<input {...fieldProps('email')} name="email" type="email" autoComplete="email" defaultValue={verifiedEmail||customerEmail(checkoutSession?.user)} required/>{fieldError('email')}</label><label>Indian mobile number<input {...fieldProps('phone')} name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" defaultValue={/^\+91[6-9][0-9]{9}$/.test(verifiedPhone||checkoutSession?.user.phoneNumber||'')?(verifiedPhone||checkoutSession?.user.phoneNumber||'').slice(3):''} required placeholder="10-digit mobile number"/>{fieldError('phone')}</label></div></section>
          <details open={gstRequired}><summary>GST billing details{gstRequired?' · Required':' · Optional'}</summary><div className="form-row"><label>GST number<input {...fieldProps('gstNumber')} name="gstNumber" onChange={event=>setGstEntered(Boolean(event.target.value.trim()))} required={gstRequired} minLength={15} maxLength={15}/>{fieldError('gstNumber')}</label><label>Registered business name<input {...fieldProps('gstName')} name="gstName" required={gstRequired||gstEntered} maxLength={35}/>{fieldError('gstName')}</label><label>Billing address<input {...fieldProps('gstAddress')} name="gstAddress" maxLength={70}/>{fieldError('gstAddress')}</label></div></details>
          <details open={emergencyRequired}><summary>Emergency contact{emergencyRequired?' · Required':' · Optional'}</summary><div className="form-row"><label>Contact name<input {...fieldProps('emergencyName')} name="emergencyName" onChange={event=>setEmergencyEntered(Boolean(event.target.value.trim()))} required={emergencyRequired} maxLength={100}/>{fieldError('emergencyName')}</label><label>Contact email<input {...fieldProps('emergencyEmail')} name="emergencyEmail" required={emergencyRequired||emergencyEntered} type="email"/>{fieldError('emergencyEmail')}</label><label>Contact phone with country code<input {...fieldProps('emergencyPhone')} name="emergencyPhone" required={emergencyRequired||emergencyEntered} type="tel" minLength={10} maxLength={20}/>{fieldError('emergencyPhone')}</label></div></details>
          {extrasResetNotice&&<p className="info-message" role="status">Flight extras were reset when the price was refreshed. Choose any extras again, or continue without extras.</p>}
          {quote.product==='FLIGHT'&&<details className="checkout-optional-extras"><summary><span>Seats, meals & extra baggage</span><small>{extrasPending?'Apply your changes to continue':'Optional · continue without extras below'}</small></summary><CheckoutExtras key={quote.quoteId} quoteId={quote.quoteId} disabled={busy||expired} onPending={setExtrasPending} onSaved={total=>{extrasApplied.current=true;setPromoRevision(n=>n+1);setExtrasResetNotice(false);setQuote(current=>current?.quoteId===quote.quoteId?{...current,totalMinor:total,discountMinor:0,promoCode:null}:current);}}/></details>}
        </fieldset>
        <div className="booking-payment-review" hidden={checkoutStep!=='payment'}>{<CheckoutPromo key={`${quote.quoteId}:${promoRevision}`} quoteId={quote.quoteId} needsConfirmation={uncertainPromoQuote===quote.quoteId} disabled={busy||expired||needsReview||Boolean(payment)||paymentUncertain||recovery.blocked||extrasPending} onBusy={pending=>{busyRef.current=pending;setBusy(pending);if(pending)setActivity('Confirming promo total');}} onUncertain={uncertain=>setUncertainPromoQuote(uncertain?quote.quoteId:null)} onUpdate={result=>setQuote(current=>current?.quoteId===result.quoteId?{...current,totalMinor:result.totalMinor,discountMinor:result.discountMinor,promoCode:result.code}:current)}/>}<div className="booking-payment-heading"><TravelIcon name="shield" size={24}/><div><h3>Travellers & contact</h3><p>Check these details before payment.</p></div></div>{travellerSummary&&<div className="final-traveller-summary"><ul>{travellerSummary.names.map((name,index)=><li key={index}><strong>{name}</strong> · {party[index]?.toLowerCase()}</li>)}</ul><p>Email: <strong>{travellerSummary.email}</strong></p><p>Mobile: <strong>{travellerSummary.phone}</strong></p><p className="muted">Names must match travel documents. Use {product==='HOTEL'?'Back to guests':'Back to travellers'} to correct a detail.</p></div>}{billingRequired&&<BillingFields addressRequired={quote.product==="FLIGHT"} disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked}/>}<h3>Total to pay</h3><p>{party.length} traveller{party.length===1?'':'s'} · {quote.product==='HOTEL'?'Full stay total':'Complete selected itinerary'}</p><strong className="booking-payment-total">{money(quote.totalMinor)}</strong><p className="muted">{quote.product==='HOTEL'&&'Online stay total. Check supplier terms for any charges payable at the property. '}Complete secure payment, then follow your booking confirmation in My trips.</p><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={backToTravellers}>{product==='HOTEL'?'Back to guests':'Back to travellers'}</button></div>
        {uncertainPromoQuote===quote.quoteId&&<div className="info-message" role="status" aria-label="Promo total confirmation"><p>{expired||needsReview?'Your promo total is unconfirmed. Check the latest price to continue with a fresh quote.':checkoutStep==='travellers'?'Your promo total still needs confirmation. Finish your details and continue to review, then apply or remove the code before paying.':'Payment is paused until you apply or remove the promo code to confirm the total.'}</p>{checkoutStep==='payment'&&!expired&&!needsReview&&<button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{const input=checkoutForm.current?.querySelector<HTMLInputElement>('[aria-label="Promo code"] input');input?.focus({preventScroll:true});input?.scrollIntoView({behavior:'smooth',block:'center'});}}>Review promo code</button>}</div>}
        {checkoutStep==='payment'&&!payment&&!paymentUncertain&&<p className="checkout-acknowledgement">By choosing Agree &amp; pay, you accept the displayed total, supplier rules and <Link href="/terms-and-conditions" target="_blank" rel="noopener noreferrer">booking terms</Link>. Payment is followed by supplier confirmation.</p>}
        <div className={`checkout-submit-action${checkoutConfigured&&!paymentUncertain?' mobile-booking-action':''}`}><div className="mobile-action-total"><small>{party.length} traveller{party.length===1?'':'s'} · reviewed total</small><strong>{money(quote.totalMinor)}</strong></div>{paymentUncertain?<Link className="primary" href="/my-trips">Check payment status in My trips</Link>:<button className="primary booking-continue" disabled={busy||(checkoutStep==='payment'&&!expired&&!needsReview&&uncertainPromoQuote===quote.quoteId)||(extrasPending&&!expired&&!needsReview)||Boolean(payment&&(expired||needsReview))||providerUnavailable||recovery.blocked}>{providerUnavailable?'Online payment unavailable':busy?'Processing…':payment?'Resume secure checkout':checkoutStep==='travellers'?'Continue to review':expired||needsReview?'Check latest price & continue':<>Agree &amp; pay <span className="checkout-pay-amount">{money(quote.totalMinor)}</span></>}</button>}</div>
        {extrasPending&&<p className="muted" role="status">{expired||needsReview?'Continue to check the latest price, then choose your extras again.':'Apply your optional extras before continuing.'}</p>}
      </form>}
    </div>
    {(!results||quote)&&<aside id="booking-summary" className={`booking-summary${!results&&!quote?" is-planning":""}${quote&&checkoutStep==='payment'?' is-payment-review':''}`} aria-label="Your journey summary">{!results&&!quote&&<div className="booking-planning-photo"><Image src={product === "FLIGHT" ? "/travel/dubai.jpg" : "/travel/bali.jpg"} alt={product === "FLIGHT" ? "Dubai skyline at sunset" : "Lakeside temple in Bali"} fill sizes="(max-width: 900px) 100vw, 360px"/><span>{product === "FLIGHT" ? "Dubai" : "Bali"} · Travel inspiration</span></div>}{!quote&&<div className="summary-compass" aria-hidden="true"><TravelIcon name="arrow-up-right" size={27} /></div>}{!quote&&<h2>Good journeys start here.</h2>}{quote?<details className="checkout-price-breakdown"><summary>Price breakdown</summary><dl className="booking-summary-lines"><div><dt>Travellers</dt><dd>{party.length}</dd></div>{quote.product==='HOTEL'&&<div><dt>Rooms</dt><dd>{reviewedRooms.length}</dd></div>}<div><dt>Reviewed {quote.product==='HOTEL'?'stay':'fare'}</dt><dd>{money(reviewBase)}</dd></div>{quote.totalMinor+(quote.discountMinor??0)!==reviewBase&&<div><dt>Selected flight extras</dt><dd>{money(quote.totalMinor+(quote.discountMinor??0)-reviewBase)}</dd></div>}{Boolean(quote.discountMinor)&&<div><dt>Promo {quote.promoCode}</dt><dd>−{money(quote.discountMinor!)}</dd></div>}<div className="booking-total"><dt>{checkoutConfigured?'Total payable':'Reviewed total'}</dt><dd>{money(quote.totalMinor)}</dd></div></dl><p className="muted">For all travellers{quote.product==='HOTEL'?' and all rooms':''}. {quote.product==='HOTEL'?'This is the reviewed online stay total. Additional property-payable charges are not verified here; check the supplier terms or contact support before booking.':'Supplier taxes and applicable booking charges are included in the reviewed total. A detailed tax split is not provided here.'}</p></details>:<><p>Compare the full price, baggage or room inclusions, and cancellation terms for your journey.</p>{!results&&<ol className="booking-guide"><li><TravelIcon name="pin" size={19}/><div><strong>Start with your plans</strong><p>Choose your destination, dates and travellers.</p></div></li><li><TravelIcon name="search" size={19}/><div><strong>Find your fit</strong><p>Compare prices and the details that matter.</p></div></li><li><TravelIcon name="receipt" size={19}/><div><strong>Know before you go</strong><p>Review the full total and supplier terms.</p></div></li></ol>}{pairedFares&&<div className="selected-journey">{fareGroups.map(group=>{const fare=selectedFare(group);return <div key={group}><span>{groupLabel(group)}</span><strong>{fare?fareDecisionName(fare):'Choose a flight'}</strong>{typeof fare?.customerEstimateMinor==='number'&&<small>{money(fare.customerEstimateMinor)} estimated</small>}</div>})}<p>Choose a fare for each flight above, then review the complete journey.</p></div>}</>}
      {!quote&&<ul className="booking-trust-note"><li>Full total before payment</li><li>Fare rules at review</li><li>Verified updates in My trips</li></ul>}<p className="booking-environment-note">In Testing · No live bookings or payments</p><Link className="inline-link" href="/my-trips">Already paid? Check My trips →</Link>
    </aside>}</div>
  </main><TravelFooter compact/></>;
}

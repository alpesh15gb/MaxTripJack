'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
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
type HotelOption={optionId:string;mealBasis?:string;pricing:{totalPrice:number;mf?:number;mft?:number};cancellation?:unknown;bookingNotes?:string};
type Hotel={tjHotelId:string;name:string;options?:HotelOption[]};
type Results={searchId:string;results:{searchResult?:{tripInfos?:Record<string,Flight[]>};hotels?:Hotel[]}};
type Quote={quoteId:string;product:Product;hotelName?:string|null;summary?:{from?:string;to?:string;date?:string;returnDate?:string;legs?:{from:string;to:string;date:string}[];checkIn?:string;checkOut?:string;adults:number;children?:number;infants?:number;rooms?:{adults:number;children:number;childAge:number[]}[]};totalMinor:number;expiresAt:string;review:{fareRules?:unknown;conditions?:{pcs?:{pm?:boolean;pped?:boolean};dob?:{adobr?:boolean;cdobr?:boolean;idobr?:boolean};gst?:{igm?:boolean};iecr?:boolean;ipa?:boolean};option?:{cancellation?:unknown;compliance?:{passportRequired?:boolean;panRequired?:boolean;gstType?:string};bookingNotes?:string;pricing?:{mf?:number;mft?:number}};alerts?:unknown}};
type Selection={priceIds?:string[];hid?:string;optionId?:string};
type CheckoutResult={razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string};
type Payment={provider?:'RAZORPAY';bookingId:string;orderId:string;amount:number;currency:string;keyId:string}|{provider:'PAYGLOCAL';bookingId:string;checkoutUrl:string;amount:number;currency:'INR'};
type Gateway={key:string;amount:number;currency:string;order_id:string;name:string;handler:(result:CheckoutResult)=>void;modal:{ondismiss:()=>void}};
declare global{interface Window{Razorpay?:new(options:Gateway)=>{open:()=>void;on:(event:string,callback:()=>void)=>void}}}
class BookingApiError extends Error { constructor(message:string,public status:number){super(message);} }
async function api<T>(path:string,data:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
  const result=await response.json();
  if(!response.ok)throw new BookingApiError(result.error||'We could not complete this request. Please try again.',response.status);
  return result;
}
function scrollToSection(id:string){requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}));}

export default function LiveBooking({prefill={}}:{prefill?:Record<string,string>}){
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
  return <LiveBookingWorkspace key={stableIdentity} prefill={prefill}/>;
}

function LiveBookingWorkspace({prefill={}}:{prefill?:Record<string,string>}){
  const router=useRouter();
  const recovery=useCheckoutRecovery();
  const initialProduct:Product=prefill.product==='HOTEL'?'HOTEL':'FLIGHT';
  const [product,setProduct]=useState<Product>(initialProduct);
  const [adults,setAdults]=useState(()=>initialAdults(prefill.adults,initialProduct));
  const [children,setChildren]=useState(0),[infants,setInfants]=useState(0);
  const [multiCity,setMultiCity]=useState(false),[legCount,setLegCount]=useState(2);
  const [hotelOccupancy,setHotelOccupancy]=useState(()=>[{adults:initialAdults(prefill.adults,'HOTEL'),childAge:[] as number[]}]);
  const [busy,setBusy]=useState(false),[activity,setActivity]=useState(''),[message,setMessage]=useState('');
  const [results,setResults]=useState<Results|null>(null),[quote,setQuote]=useState<Quote|null>(null);
  const [rooms,setRooms]=useState<{hid:string;name:string;options:HotelOption[]}|null>(null);
  const [selectedFares,setSelectedFares]=useState<Record<string,string>>({}),[activeGroup,setActiveGroup]=useState('');
  const [sortBy,setSortBy]=useState('price'),[stopFilter,setStopFilter]=useState('ALL');
  const [extrasPending,setExtrasPending]=useState(false);
  const [gstEntered,setGstEntered]=useState(false),[emergencyEntered,setEmergencyEntered]=useState(false);
  const [checkoutStep,setCheckoutStep]=useState<'travellers'|'payment'>('travellers');
  const [reviewBase,setReviewBase]=useState(0),[now,setNow]=useState<number|null>(null);
  const [selection,setSelection]=useState<Selection|null>(null),[payment,setPayment]=useState<Payment|null>(null);
  const [paymentUncertain,setPaymentUncertain]=useState(false),[needsReview,setNeedsReview]=useState(false);
  const searchForm=useRef<HTMLFormElement>(null),checkoutForm=useRef<HTMLFormElement>(null);
  const autoSearchStarted=useRef(false),operation=useRef(0),requestController=useRef<AbortController|null>(null),busyRef=useRef(false);
  const mounted=useRef(true),verificationStarted=useRef(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current+=1;requestController.current?.abort();};},[]);
  useEffect(()=>{
    if(prefill.autoSearch!=='1'||autoSearchStarted.current||recovery.blocked||paymentUncertain)return;
    const timer=setTimeout(()=>{
      if(autoSearchStarted.current)return;
      autoSearchStarted.current=true;
      const form=searchForm.current;
      if(form?.checkValidity())form.requestSubmit();
    },0);
    return()=>clearTimeout(timer);
  },[prefill.autoSearch,recovery.blocked,paymentUncertain]);
  useEffect(()=>{
    if(!quote)return;
    const tick=()=>setNow(Date.now());
    const immediate=setTimeout(tick,0);
    const timer=setInterval(tick,1000);
    return()=>{clearTimeout(immediate);clearInterval(timer);};
  },[quote]);

  const reviewedRooms=quote?.summary?.rooms??hotelOccupancy.map(room=>({...room,children:room.childAge.length}));
  const hotelParty=reviewedRooms.flatMap((room,roomIndex)=>[...Array.from({length:room.adults},()=>({pt:'ADULT',roomIndex})),...Array.from({length:room.children},()=>({pt:'CHILD',roomIndex}))]);
  const party=quote?.product==='HOTEL'?hotelParty.map(person=>person.pt):[...Array.from({length:quote?.summary?.adults??adults},()=>'ADULT'),...Array.from({length:quote?.summary?.children??children},()=>'CHILD'),...Array.from({length:quote?.summary?.infants??infants},()=>'INFANT')];
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
  const flightRows=(groups[shownGroup]??[]).filter(flight=>stopFilter==='ALL'||shownGroup==='COMBO'||String(flightStops(flight,shownGroup))===stopFilter).slice().sort((a,b)=>sortBy==='departure'?(a.sI[0]?.dt??'').localeCompare(b.sI[0]?.dt??''):sortBy==='duration'?(journeyMinutes(a,shownGroup)??Number.MAX_SAFE_INTEGER)-(journeyMinutes(b,shownGroup)??Number.MAX_SAFE_INTEGER):estimatedFare(a)-estimatedFare(b));
  const selectedFare=(group:string)=>groups[group]?.flatMap(flight=>flight.totalPriceList).find(fare=>fare.id===selectedFares[group]);
  const allSelected=fareGroups.every(group=>selectedFares[group]);
  const step=quote?(checkoutStep==='payment'?3:2):results?1:0;
  const summaryTitle=quote?.product==='HOTEL'?quote.hotelName||'Your selected stay':quote?.summary?.legs?quote.summary.legs.map(leg=>`${leg.from} → ${leg.to}`).join(' · '):quote?`${quote.summary?.from} → ${quote.summary?.to}`:product==='HOTEL'?'A stay that suits you':'Your next journey';

  function begin(label:string){
    if(busyRef.current)return null;
    busyRef.current=true;setBusy(true);setActivity(label);setMessage('');
    const id=++operation.current;
    requestController.current?.abort();
    const controller=new AbortController();requestController.current=controller;
    return {id,signal:controller.signal};
  }
  function current(id:number){return mounted.current&&operation.current===id;}
  function finish(id:number){if(current(id)){busyRef.current=false;setBusy(false);setActivity('');}}
  function report(error:unknown,id:number){if(current(id)){setMessage(error instanceof Error?error.message:'This request could not be completed.');scrollToSection('booking-feedback');}}
  function switchProduct(next:Product){
    if(busyRef.current||payment||paymentUncertain||recovery.blocked)return;
    setProduct(next);setResults(null);setQuote(null);setRooms(null);setSelectedFares({});setMessage('');setSelection(null);setCheckoutStep('travellers');setExtrasPending(false);
  }
  async function search(form:HTMLFormElement){
    const task=begin('Finding available journeys');if(!task)return;
    const fields=new FormData(form);
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
      const input=product==='FLIGHT'?{product,from:origin,to:destination,date,adults,children,infants,cabin:String(fields.get('cabin')),...(multiCity?{legs}:returnDate?{returnDate}:{})}:{product,hotelIds:parseHotelIds(String(fields.get('hotelIds')??'')),checkIn:date,checkOut:String(fields.get('end')),adults:hotelOccupancy[0].adults,rooms:hotelOccupancy.map(room=>({...room,children:room.childAge.length})),childrenAges:hotelOccupancy[0].childAge,nationality:String(fields.get('nationality'))};
      setQuote(null);setResults(null);setRooms(null);setSelectedFares({});setSelection(null);setSortBy('price');setStopFilter('ALL');setPayment(null);setPaymentUncertain(false);setNeedsReview(false);
      const data=await api<Results>('/api/travel/search',input,task.signal);
      if(current(task.id)){setResults(data);setActiveGroup(orderedGroups(data.results.searchResult?.tripInfos??{})[0]??'');scrollToSection('booking-results');}
    }catch(error){report(error,task.id);}finally{finish(task.id);}
  }
  async function review(nextSelection:Selection,renew=false){
    const task=begin(renew?'Checking the latest price and rules':'Reviewing your selection');if(!task)return;
    try{
      const value=await api<Quote>('/api/travel/review',{searchId:results?.searchId,...nextSelection},task.signal);
      if(current(task.id)){
        setQuote(value);setSelection(nextSelection);setReviewBase(value.totalMinor);setNow(null);setExtrasPending(false);setCheckoutStep('travellers');setPayment(null);setPaymentUncertain(false);setNeedsReview(false);
        if(!renew){setGstEntered(false);setEmergencyEntered(false);}
        if(renew)setMessage('Price and rules refreshed. Your traveller details are kept on this page. Review optional extras again and accept the latest total before payment.');
        scrollToSection('booking-review');
      }
    }catch(error){report(error,task.id);}finally{finish(task.id);}
  }
  async function chooseHotel(hotel:Hotel){
    const task=begin('Checking room availability');if(!task)return;
    try{const detail=await api<{options:HotelOption[]}>('/api/travel/hotel-detail',{searchId:results?.searchId,hid:hotel.tjHotelId},task.signal);if(current(task.id)){setRooms({hid:hotel.tjHotelId,name:hotel.name,options:detail.options});scrollToSection('booking-rooms');}}catch(error){report(error,task.id);}finally{finish(task.id);}
  }
  function chooseFare(group:string,fare:FlightFare){
    if(!pairedFares){void review({priceIds:[fare.id]});return;}
    setSelectedFares(previous=>{
      const next={...previous,[group]:fare.id};
      if(group==='ONWARD'&&next.RETURN){const back=selectedFare('RETURN');if(back&&!compatibleReturnPair(fare,back))delete next.RETURN;}
      return next;
    });
    const nextGroup=fareGroups[fareGroups.indexOf(group)+1];
    if(nextGroup){setActiveGroup(nextGroup);setStopFilter('ALL');scrollToSection('booking-results');}else scrollToSection('booking-summary');
  }
  function openCheckout(order:Payment){
    if(order.provider==='PAYGLOCAL'){
      if(!isResumableHostedCheckout({...order,canResume:true}))throw Error('Hosted checkout details could not be verified. Check My trips before paying again.');
      setActivity('Redirecting to secure checkout; payment verification follows in My trips');
      window.location.assign(order.checkoutUrl);return;
    }
    if(!window.Razorpay)throw Error('Secure checkout is still loading. Please wait a moment.');
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
    if(checkoutStep==='travellers'){setCheckoutStep('payment');scrollToSection('booking-review');return;}
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
      const action=paymentFailureAction(error instanceof BookingApiError?error.status:undefined,failureMessage);
      if(action==='status')setPaymentUncertain(true);else clearCheckoutMarker({quoteId:quote.quoteId});
      if(action==='refresh')setNeedsReview(true);
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

  return <><TravelHeader active={product==='FLIGHT'?'flights':'hotels'} onProductChange={switchProduct}/><main id="main-content" className="page-shell live-booking booking-workflow">
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onError={()=>setMessage('Payment checkout could not load. Check your connection. You can still compare journeys.')}/>
    <Link href="/" className="back">← Back to explore</Link>
    <div className="page-heading"><div><div className="eyebrow">YOUR JOURNEY, YOUR WAY · TEST ENVIRONMENT</div><h1>Let’s get you going.</h1><p>Thoughtful choices. A clear total. Your next chapter starts here.</p></div><Link className="secondary" href="/account">Your account</Link></div>
    <ol className="booking-progress" aria-label="Booking progress">{['Search','Choose','Travellers','Payment'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={index<step?'is-complete':index===step?'is-current':''}><span aria-hidden="true">{index<step?'✓':index+1}</span>{label}</li>)}</ol>
    <div className="booking-layout"><div className="booking-main">
      {recovery.checking&&<div className="booking-status info-message" role="status">Checking for an interrupted checkout…</div>}
      {recovery.pending&&<section className="white-card booking-recovery" aria-label="Interrupted checkout"><div className="eyebrow">LET’S PICK UP SAFELY</div><h2>Your previous checkout needs a look.</h2><p role="status">{recovery.message}</p><p className="muted">We have paused new payments so you do not accidentally pay twice. No traveller or contact details are saved in this browser.</p>{recovery.status&&(isResumableCheckout(recovery.status)||isResumableHostedCheckout(recovery.status))&&<button type="button" className="primary" disabled={busy||recovery.checking} onClick={()=>void resumeInterrupted()}>Resume existing checkout · {money(recovery.status.amount)}</button>}<button type="button" className="secondary" disabled={busy||recovery.checking} onClick={()=>{if(recovery.pending)void recovery.reconcile(recovery.pending);}}>Check payment status again</button><Link className="secondary" href="/my-trips">Open My trips</Link>{/sign in/i.test(recovery.message)&&<Link className="inline-link" href="/account">Sign in to check your payment</Link>}</section>}
      {!recovery.pending&&recovery.message&&<p className="info-message" role="status">{recovery.message} <Link href="/my-trips">My trips →</Link></p>}
      <div className="account-tabs" aria-label="Booking product"><button type="button" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} aria-pressed={product==='FLIGHT'} onClick={()=>switchProduct('FLIGHT')}>✈ Flights</button><button type="button" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} aria-pressed={product==='HOTEL'} onClick={()=>switchProduct('HOTEL')}>▤ Stays</button></div>
      <details className="booking-search-panel" open={!results&&!quote}><summary>{results||quote?'Your search · change dates or travellers':'Where would you like to go?'}</summary>
      <form ref={searchForm} aria-label="Search availability" className="white-card live-search" onSubmit={event=>{event.preventDefault();void search(event.currentTarget);}}>
        <fieldset className="live-search-controls" disabled={busy||Boolean(quote)||Boolean(payment)||paymentUncertain||recovery.blocked}>
          {product==='FLIGHT'&&<label>Journey type<select value={multiCity?'MULTI':'STANDARD'} onChange={event=>{setMultiCity(event.target.value==='MULTI');setResults(null);setSelectedFares({});}}><option value="STANDARD">One-way / return</option><option value="MULTI">Multi-city</option></select></label>}
          <div className="form-row">{product==='FLIGHT'?<><AirportPicker name="from" label="From airport" initialCode={prefill.from||'BOM'}/><AirportPicker name="to" label="To airport" initialCode={prefill.to||'DEL'}/></>:<><HotelDestination initialQuery={prefill.city||''} initialHotelIds={parseHotelIds(prefill.hotelIds)}/><NationalitySelect initialValue={/^\d+$/.test(prefill.nationality??'')?prefill.nationality:'106'}/></>}</div>
          <div className="form-row"><label>{product==='FLIGHT'?'Departure':'Check-in'}<input name="date" required type="date" min={indiaToday()} defaultValue={prefill.date}/></label>{product==='HOTEL'&&<label>Check-out<input name="end" required type="date" min={indiaToday()} defaultValue={prefill.end}/></label>}{product==='FLIGHT'&&!multiCity&&<label>Return date, optional<input name="returnDate" type="date" min={indiaToday()} defaultValue={prefill.returnDate}/></label>}{product==='FLIGHT'&&<label>Adults<select value={adults} onChange={event=>{const count=Number(event.target.value);setAdults(count);setInfants(value=>Math.min(value,count));}}>{[1,2,3,4,5,6,7,8,9].map(count=><option key={count}>{count}</option>)}</select></label>}</div>
          {product==='FLIGHT'?<div className="form-row"><label>Children · age 2–11<select value={children} onChange={event=>setChildren(Number(event.target.value))}>{[0,1,2,3,4,5,6,7,8].map(count=><option key={count}>{count}</option>)}</select></label><label>Infants · under 2<select value={infants} onChange={event=>setInfants(Number(event.target.value))}>{Array.from({length:adults+1},(_,count)=><option key={count}>{count}</option>)}</select></label><label>Cabin<select name="cabin"><option value="ECONOMY">Economy</option><option value="PREMIUM_ECONOMY">Premium economy</option><option value="BUSINESS">Business</option><option value="FIRST">First</option></select></label></div>:<><label>Rooms<select value={hotelOccupancy.length} onChange={event=>{const count=Number(event.target.value);setHotelOccupancy(current=>Array.from({length:count},(_,index)=>current[index]??{adults:2,childAge:[]}));}}>{[1,2,3,4].map(count=><option key={count}>{count}</option>)}</select></label>{hotelOccupancy.map((room,roomIndex)=><fieldset key={roomIndex}><legend>Room {roomIndex+1} · Guests</legend><div className="form-row"><label>Adults<select value={room.adults} onChange={event=>setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,adults:Number(event.target.value)}:value))}>{[1,2,3,4].map(count=><option key={count}>{count}</option>)}</select></label><label>Children<select value={room.childAge.length} onChange={event=>{const count=Number(event.target.value);setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,childAge:Array.from({length:count},(_,child)=>value.childAge[child]??0)}:value));}}>{[0,1,2,3].map(count=><option key={count}>{count}</option>)}</select></label>{room.childAge.map((age,childIndex)=><label key={childIndex}>Child {childIndex+1} age at check-in<input type="number" required min={0} max={17} value={age} onChange={event=>setHotelOccupancy(current=>current.map((value,index)=>index===roomIndex?{...value,childAge:value.childAge.map((child,i)=>i===childIndex?Number(event.target.value):child)}:value))}/></label>)}</div></fieldset>)}</>}
          {product==='FLIGHT'&&multiCity&&<div className="multi-city-legs">{Array.from({length:legCount-1},(_,index)=><fieldset key={index}><legend>Flight {index+2}</legend><div className="form-row"><AirportPicker name={`leg-from-${index+1}`} label="From airport" initialCode=""/><AirportPicker name={`leg-to-${index+1}`} label="To airport" initialCode=""/><label>Departure<input name={`leg-date-${index+1}`} type="date" min={indiaToday()} required/></label></div></fieldset>)}<button className="secondary" type="button" disabled={legCount>=6} onClick={()=>setLegCount(value=>value+1)}>+ Add flight</button>{legCount>2&&<button className="secondary" type="button" onClick={()=>setLegCount(value=>value-1)}>Remove last flight</button>}</div>}
          <p className="muted">{product==='FLIGHT'?'Up to 9 adults and children, plus infants. All results show your party’s estimated total.':'Set guests for each room. Child ages must match their dates of birth at check-in.'}</p><button className="primary" disabled={busy}>{busy?'Checking availability…':product==='FLIGHT'?'Search flights':'Search stays'}</button>
        </fieldset>{quote&&<p className="muted">To edit your search, return to your selection first.</p>}
      </form></details>
      <div id="booking-feedback" tabIndex={-1}>{message&&<div className="booking-status info-message" role="alert"><p>{message}</p>{/sign in/i.test(message)&&<Link className="inline-link" href="/account">Sign in or create an account</Link>}{(payment||paymentUncertain)&&<Link className="inline-link" href="/my-trips">View payment and booking status →</Link>}</div>}</div>
      {busy&&<div className="booking-skeleton" role="status" aria-live="polite"><span aria-hidden="true" className="booking-spinner"/><strong>{activity}…</strong><p>We’re checking the details, so you can choose with confidence.</p></div>}
      {results&&!quote&&<section id="booking-results" className="live-results" aria-label="Available options">
        <div className="results-heading"><div><div className="eyebrow">MAKE IT YOUR JOURNEY</div><h2>{product==='FLIGHT'?'Find your kind of flight.':'Find a place to call yours.'}</h2><p className="muted">{product==='FLIGHT'?'Compare timings and fare benefits. Final price and rules are checked before payment.':'Choose a hotel, then compare available room options and cancellation terms.'}</p></div><span className="results-count">{product==='FLIGHT'?flightRows.length:results.results.hotels?.length??0} options</span></div>
        {product==='FLIGHT'&&<>
          {pairedFares&&<div className="flight-group-tabs" aria-label="Choose each flight">{fareGroups.map(group=><button type="button" key={group} className={shownGroup===group?'is-active':''} aria-pressed={shownGroup===group} onClick={()=>{setActiveGroup(group);setStopFilter('ALL');}}>{groupLabel(group)} {selectedFares[group]?'✓':''}</button>)}</div>}
          <div className="results-toolbar" aria-label="Flight result controls"><label>Sort by<select value={sortBy} onChange={event=>setSortBy(event.target.value)}><option value="price">Lowest estimated price</option><option value="duration">Shortest known duration</option><option value="departure">Earliest departure</option></select></label><label>Stops<select value={stopFilter} disabled={shownGroup==='COMBO'} onChange={event=>setStopFilter(event.target.value)}><option value="ALL">Any number of stops</option><option value="0">Non-stop</option><option value="1">1 stop</option><option value="2">2 stops</option></select></label>{shownGroup==='COMBO'&&<p className="muted">Complete itineraries: inspect each flight below.</p>}</div>
          {flightRows.map((flight,index)=><BookingFlightCard key={`${shownGroup}-${flight.totalPriceList[0]?.id??index}`} flight={flight} group={shownGroup} busy={busy} selectedFareId={selectedFares[shownGroup]} onSelect={fare=>chooseFare(shownGroup,fare)} isCompatible={fare=>{const onward=selectedFare('ONWARD');return shownGroup!=='RETURN'||!onward||compatibleReturnPair(onward,fare);}}/>)}
          {!flightRows.length&&<div className="empty-results"><h3>{fareGroups.length?'No flights match these filters':'No flights found'}</h3><p>{fareGroups.length?'Try another stop filter to see more journeys.':'Try a different date, route or cabin.'}</p>{fareGroups.length>0&&<button className="secondary" type="button" onClick={()=>setStopFilter('ALL')}>Reset filters</button>}</div>}
        </>}
        {product==='HOTEL'&&<div className="booking-hotel-list">{results.results.hotels?.map(hotel=><article className="white-card booking-record booking-hotel-card" key={hotel.tjHotelId}><span className="hotel-result-icon" aria-hidden="true">▤</span><div><div className="eyebrow">AVAILABLE STAY</div><h3>{hotel.name}</h3><p className="muted">See current rooms, meal plans and cancellation terms.</p></div><button type="button" className="primary" disabled={busy} onClick={()=>void chooseHotel(hotel)}>Choose room</button></article>)}{!results.results.hotels?.length&&<div className="empty-results"><h3>No stays found</h3><p>Try another destination or date range.</p></div>}</div>}
      </section>}
      {rooms&&!quote&&product==='HOTEL'&&<section id="booking-rooms" className="white-card booking-rooms" aria-label="Room options"><div className="eyebrow">YOUR STAY, YOUR STYLE</div><h2>{rooms.name}</h2>{rooms.options.length?rooms.options.map(option=><article className="live-fare" key={option.optionId}><div><h3>{option.mealBasis?.replaceAll('_',' ')||'Room option'}</h3><strong>{money(Math.round(option.pricing.totalPrice*100))} <small>total for the full stay</small></strong><p className="muted">All selected rooms and guests · final total at review</p>{option.bookingNotes&&<p>{option.bookingNotes}</p>}<details><summary>Cancellation policy</summary><SupplierPolicy title="Supplier cancellation terms" value={option.cancellation}/></details></div><button type="button" className="primary" disabled={busy} onClick={()=>void review({hid:rooms.hid,optionId:option.optionId})}>Review room</button></article>):<div className="empty-results"><h3>No rooms available</h3><p>Choose another hotel or change your dates.</p></div>}</section>}
      {quote&&<form ref={checkoutForm} id="booking-review" aria-label="Review and travellers" className="white-card booking-review" onSubmit={event=>{event.preventDefault();void submitCheckout(event.currentTarget);}}>
        <div className="page-heading"><div><div className="eyebrow">{checkoutStep==='payment'?'ONE LAST LOOK':'YOUR TRIP IS TAKING SHAPE'}</div><h2>{checkoutStep==='payment'?'Ready when you are.':'Who’s coming along?'}</h2><h3>{summaryTitle}</h3><p>{quote.summary?.date||quote.summary?.checkIn}{(quote.summary?.returnDate||quote.summary?.checkOut)?` — ${quote.summary?.returnDate||quote.summary?.checkOut}`:''} · {party.length} traveller{party.length===1?'':'s'}{quote.product==='HOTEL'?` · ${reviewedRooms.length} room${reviewedRooms.length===1?'':'s'}`:''}</p></div><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>{setQuote(null);setExtrasPending(false);setCheckoutStep('travellers');scrollToSection('booking-results');}}>Change selection</button></div>
        <div className={`booking-expiry${expired||needsReview?' is-expired':''}`} role={expired||needsReview?'alert':undefined}><div><strong>{payment?'Payment order created':expired||needsReview?'A fresh price review is required':`Price reviewed · ${remaining===null?'checking validity':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`}`}</strong><p>{payment?'Your original order is preserved. Check My trips if your payment status is unclear.':expired||needsReview?'Keep your traveller details. Refresh the price and rules before continuing.':'Fares can change. We’ll ask you to accept any new total before payment.'}</p></div>{!payment&&!paymentUncertain&&selection&&<button type="button" className="secondary" disabled={busy} onClick={()=>void review(selection,true)}>Refresh reviewed price</button>}</div>
        <details open><summary>Fare conditions, cancellation & documents</summary>{hasCancellationTerms?<SupplierPolicy title="Cancellation and fare rules" value={cancellationTerms}/>:<section className="supplier-policy" aria-label="Cancellation and fare rules"><h4>Cancellation and fare rules</h4><p className="policy-note">Cancellation terms unavailable. Do not assume this fare is refundable. Contact support for the terms before paying.</p></section>}<section className="supplier-policy" aria-label="Required booking details"><h4>Required booking details</h4>{requiredBookingDetails.length?<ul className="fare-features">{requiredBookingDetails.map(detail=><li key={detail}>{detail}</li>)}</ul>:<p className="policy-note">No additional documents are requested in this review. Traveller names must match their travel documents.</p>}</section></details>
        {Boolean(quote.review.alerts)&&<div className="info-message"><strong>Supplier update</strong><SupplierPolicy title="Review these fare alerts" value={quote.review.alerts}/></div>}
        <fieldset className="booking-traveller-fields" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} hidden={checkoutStep==='payment'}>
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
        {checkoutStep==='payment'&&<div className="booking-payment-review"><h3>Your total, before you pay.</h3><p>{party.length} traveller{party.length===1?'':'s'} · {quote.product==='HOTEL'?'Full stay total':'Complete selected itinerary'}</p><strong className="booking-payment-total">{money(quote.totalMinor)}</strong><p className="muted">Payment opens with the configured secure payment provider. A successful payment is not a confirmed ticket or room: supplier confirmation follows in My trips.</p><label className="checkbox consent"><input key={`${quote.quoteId}:${quote.totalMinor}`} name="consent" type="checkbox" required disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked}/>I accept the reviewed total and supplier rules. This is a test booking with test-mode payment.</label><button type="button" className="secondary" disabled={busy||Boolean(payment)||paymentUncertain||recovery.blocked} onClick={()=>setCheckoutStep('travellers')}>Back to travellers</button></div>}
        {paymentUncertain?<Link className="primary" href="/my-trips">Check payment status in My trips</Link>:<button className="primary booking-continue" disabled={busy||extrasPending||expired||needsReview}>{busy?'Processing…':checkoutStep==='travellers'?'Continue to payment':payment?'Resume secure checkout':`Pay ${money(quote.totalMinor)} securely`}</button>}
        {extrasPending&&<p className="muted" role="status">Apply your optional extras before continuing.</p>}
      </form>}
    </div>
    <aside id="booking-summary" className="booking-summary" aria-label="Your journey summary"><div className="eyebrow">A LITTLE LESS PLANNING</div><h2>{quote?'Your trip, at a glance.':'Good journeys start here.'}</h2>{quote?<><h3>{summaryTitle}</h3><p>{quote.summary?.date||quote.summary?.checkIn}{(quote.summary?.returnDate||quote.summary?.checkOut)?` — ${quote.summary?.returnDate||quote.summary?.checkOut}`:''}</p><dl className="booking-summary-lines"><div><dt>Travellers</dt><dd>{party.length}</dd></div>{quote.product==='HOTEL'&&<div><dt>Rooms</dt><dd>{reviewedRooms.length}</dd></div>}<div><dt>Reviewed {quote.product==='HOTEL'?'stay':'fare'}</dt><dd>{money(reviewBase)}</dd></div>{quote.totalMinor!==reviewBase&&<div><dt>Selected flight extras</dt><dd>{money(quote.totalMinor-reviewBase)}</dd></div>}<div className="booking-total"><dt>Total payable</dt><dd>{money(quote.totalMinor)}</dd></div></dl><p className="muted">For all travellers{quote.product==='HOTEL'?' and all rooms':''}. Supplier taxes and applicable booking charges are included in the reviewed total. A detailed tax split is not provided here.</p></>:<><p>Compare what matters. Choose what fits. We’ll check your selection before you pay.</p>{pairedFares&&<div className="selected-journey">{fareGroups.map(group=>{const fare=selectedFare(group);return <div key={group}><span>{groupLabel(group)}</span><strong>{fare?fare.fareIdentifier.replaceAll('_',' '):'Choose a flight'}</strong>{typeof fare?.customerEstimateMinor==='number'&&<small>{money(fare.customerEstimateMinor)} estimated</small>}</div>})}<button type="button" className="primary" disabled={busy||!allSelected} onClick={()=>void review({priceIds:fareGroups.map(group=>selectedFares[group])})}>Review selected journey ({fareGroups.filter(group=>selectedFares[group]).length}/{fareGroups.length})</button></div>}</>}
      <ul className="booking-trust-note"><li>Full total before payment</li><li>Fare rules at review</li><li>Verified updates in My trips</li></ul><p className="booking-environment-note">Test environment · No live payments</p><Link className="inline-link" href="/my-trips">Already paid? Check My trips →</Link>
    </aside></div>
  </main><TravelFooter/></>;
}

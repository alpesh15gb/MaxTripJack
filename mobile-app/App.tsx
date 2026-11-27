import BillingFields from "./src/billing-fields";
import {emptyBilling,checkedBilling,type GatewayConfig,type NativePaidPayment} from "./src/billing-data";
import {checkedPayment,checkedPaymentRecovery} from "./src/payment-recovery";
import {ApiHttpError} from "./src/api-transport";
import {checkCheckoutGuests,checkedContactPhone} from "./src/checkout-guest";
import { serviceConditions } from "./src/service-conditions";
import {reviewDisclosure,policyDisclosure} from "./src/review-disclosure";
import React,{createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState} from "react";
import { ActivityIndicator,AppState,BackHandler,Linking,ImageBackground,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { SafeAreaProvider,SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import RazorpayCheckout from "react-native-razorpay";
import CheckoutExtras from "./src/checkout-extras";
import NativeAccountTools from "./src/native-account";
import { api,authClient,API_URL } from "./src/api";
import { createRequestGate,createPaymentRecovery,createSearchSnapshot,isQuoteExpired,mergeTripPage,type Guest,type RequestContext } from "./src/booking-state";
const BusyContext=createContext(false);
const PaymentSafetyContext=createContext<{gateway:GatewayConfig|null;blocked:boolean;start:(quoteId:string)=>Promise<boolean>;verified:(quoteId:string)=>Promise<void>;refresh:()=>void}>({gateway:null,blocked:true,start:async()=>false,verified:async()=>{},refresh:()=>{}});
const InputFocusContext=createContext<{register:(id:string,input:TextInput|null)=>void;focusNext:(id:string)=>boolean}>({register:()=>{},focusNext:()=>false});
const NavigationGuardContext=createContext<(id:string,blocked:boolean,message:string)=>void>(()=>{});
const COLORS={action:"#005bb3",ink:"#001736",muted:"#52667d",line:"#dce2eb",page:"#f7f9fc",success:"#17633f",error:"#a21d2a"};
function InputFocusProvider({children}:{children:React.ReactNode}){
 const inputs=useRef(new Map<string,TextInput>());
 const register=useCallback((id:string,input:TextInput|null)=>{if(input)inputs.current.set(id,input);else inputs.current.delete(id);},[]);
 const focusNext=useCallback((id:string)=>{const keys=[...inputs.current.keys()],index=keys.indexOf(id);if(index<0)return false;const next=inputs.current.get(keys[index+1]);if(!next)return false;next.focus();return true;},[]);
 const value=useMemo(()=>({register,focusNext}),[register,focusNext]);
 return <InputFocusContext.Provider value={value}>{children}</InputFocusContext.Provider>;
}
async function guardedApi<T>(request:RequestContext,path:string,data?:unknown,method?:string):Promise<T>{
 if(!request.isCurrent())throw Error("This request is no longer active.");
 const result=await api<T>(path,data,method,request.signal);
 if(!request.isCurrent())throw Error("This request is no longer active.");
 return result;
}
type Tab="Home"|"Book"|"My trips"|"Account";
type Trip={linked_services?:{reference:string;kind:string;status:string}[];service_kind?:string|null;parent_order_id?:string|null;id:string;reference:string;product:string;status:string;total_minor:string;currency:string;created_at:string;refunds?:{id:string;amountMinor:string;status:string}[]};
type Flight={sI:{dt:string;at:string;fD:{aI:{name:string}};da:{code:string};aa:{code:string}}[];totalPriceList:{id:string;fareIdentifier:string;customerEstimateMinor?:number|null;fD:{ADULT:{fC:{TF:number}}}}[]};
type Room={optionId:string;mealBasis:string;pricing:{totalPrice:number};cancellation:unknown};
type Hotel={tjHotelId:string;name:string};
type Results={searchId:string;results:{searchResult?:{tripInfos:Record<string,Flight[]>};hotels?:Hotel[]}};
async function openPayment(request:RequestContext,payment:NativePaidPayment,name:string,prefill?:{email:string;contact:string}){
 if(!request.isCurrent())throw Error("Check the saved payment in My trips.");
 if(payment.provider==="PAYGLOCAL"){
  await Linking.openURL(payment.checkoutUrl);
  return false;
 }
 const result=await RazorpayCheckout.open({key:payment.keyId,amount:payment.amount,currency:payment.currency,order_id:payment.orderId,name,description:"In Testing",prefill,theme:{color:COLORS.action}});
 if(result.razorpay_order_id!==payment.orderId)throw Error("The payment does not match the saved order. Check My trips.");
 const verified=await guardedApi<{bookingId:string;status:string}>(request,"/api/payments/verify",{
  bookingId:payment.bookingId,
  razorpay_payment_id:result.razorpay_payment_id,
  razorpay_order_id:result.razorpay_order_id,
  razorpay_signature:result.razorpay_signature,
 });
 if(verified.bookingId!==payment.bookingId||verified.status!=="PAYMENT_VERIFIED")throw Error("Payment verification is incomplete. Check My trips.");
 return true;
}
type Quote={quoteId:string;hotelName?:string|null;summary?:{from?:string;to?:string;date?:string;returnDate?:string;legs?:{from:string;to:string;date:string}[];checkIn?:string;checkOut?:string};totalMinor:number;expiresAt:string;review:{fareRules?:unknown;conditions?:unknown;option?:{cancellation:unknown;compliance:unknown};alerts?:unknown}};
const amount=(minor:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(minor/100);
function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){const parentBusy=useContext(BusyContext);disabled=disabled||parentBusy;return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondary,disabled&&{opacity:.5}]}><Text style={[styles.buttonText,secondary&&{color:COLORS.action}]}>{title}</Text></Pressable>;}
function Field({label,value,onChange,secure=false,keyboard="default",placeholder=""}:{label:string;value:string;onChange:(value:string)=>void;secure?:boolean;keyboard?:"default"|"email-address"|"number-pad"|"phone-pad";placeholder?:string}){
 const disabled=useContext(BusyContext),input=useRef<TextInput>(null),id=useId(),focus=useContext(InputFocusContext);
 const setInput=useCallback((node:TextInput|null)=>{input.current=node;focus.register(id,node);},[focus,id]);
 return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput ref={setInput} editable={!disabled} accessibilityState={{disabled}} accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry={secure} keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={COLORS.muted} autoCapitalize={secure||keyboard==="email-address"?"none":"sentences"} autoComplete={keyboard==="email-address"?"email":"off"} returnKeyType="next" submitBehavior="submit" onSubmitEditing={()=>{if(!focus.focusNext(id))input.current?.blur();}} style={[styles.input,disabled&&styles.disabled]}/></View>;
}
function AirportField({label,value,onSelect}:{label:string;value:string;onSelect:(code:string)=>void}){
 const [query,setQuery]=useState(value),[open,setOpen]=useState(false),[rows,setRows]=useState<{code:string;city:string;name:string;country:string}[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 useEffect(()=>{
  setRows([]);setError("");
  if(!open||query.trim().length<2){setLoading(false);return;}
  let active=true;const controller=new AbortController();setLoading(true);
  const timer=setTimeout(()=>{api<{airports:typeof rows}>(`/api/travel/airports?q=${encodeURIComponent(query.trim())}`,undefined,undefined,controller.signal).then(data=>{if(active)setRows(data.airports);}).catch(e=>{if(active&&controller.signal.aborted===false)setError(e instanceof Error?e.message:"Airport search is unavailable.");}).finally(()=>{if(active)setLoading(false);});},200);
  return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[query,open,retry]);
 return <View><Field label={label} value={query} onChange={text=>{setQuery(text);setOpen(true);onSelect(/^[A-Za-z]{3}$/.test(text)?text.toUpperCase():"");}} placeholder="City or airport"/>{loading&&<Text accessibilityLiveRegion="polite" style={styles.caption}>Searching airports…</Text>}{error!==""&&<><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button title="Retry airport search" secondary onPress={()=>setRetry(value=>value+1)}/></>}{open&&!loading&&error===""&&query.trim().length>=2&&rows.length===0&&<Text style={styles.caption}>No airport found. Try a city or airport code.</Text>}{open&&rows.map(row=><Button key={row.code} title={`${row.city||row.name} (${row.code}) · ${row.country}`} secondary onPress={()=>{setQuery(`${row.city||row.name} (${row.code})`);setOpen(false);onSelect(row.code);}}/>)}</View>;
}
function NationalityPicker({value,onLabelChange,onSelect}:{value:string;onLabelChange:(value:string)=>void;onSelect:(id:string)=>void}){
 const [rows,setRows]=useState<{countryId:string;name:string}[]>([]),[open,setOpen]=useState(false),[message,setMessage]=useState(""),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();setLoading(true);setMessage("");api<{nationalities:typeof rows}>("/api/travel/nationalities",undefined,undefined,controller.signal).then(data=>{if(active)setRows(data.nationalities);}).catch(e=>{if(active&&controller.signal.aborted===false)setMessage(e instanceof Error?e.message:"Nationality list is unavailable.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;controller.abort();};},[retry]);
 const filtered=rows.filter(row=>row.name.toLowerCase().includes(value.toLowerCase())).slice(0,10);
 return <View><Field label="Guest nationality" value={value} onChange={query=>{onLabelChange(query);setOpen(true);onSelect("");}}/>{loading&&<Text accessibilityLiveRegion="polite" style={styles.caption}>Loading nationalities…</Text>}{message!==""&&<><Text accessibilityRole="alert" style={styles.error}>{message}</Text><Button title="Retry nationality list" secondary onPress={()=>setRetry(current=>current+1)}/></>}{open&&!loading&&message===""&&filtered.length===0&&<Text style={styles.caption}>No matching nationality. Try another country name.</Text>}{open&&filtered.map(row=><Button key={row.countryId} title={row.name} secondary onPress={()=>{onSelect(row.countryId);onLabelChange(row.name);setOpen(false);}}/>)}</View>;
}
type DestinationState={query:string;selected:{region_id:string;label:string}|null;page:number;hasMore:boolean};
function DestinationPicker({draft,setDraft,onSelect}:{draft:DestinationState;setDraft:React.Dispatch<React.SetStateAction<DestinationState>>;onSelect:(ids:string)=>void}){
 const {query,selected,page,hasMore}=draft;
 const [rows,setRows]=useState<{region_id:string;label:string}[]>([]),[message,setMessage]=useState(""),[loading,setLoading]=useState(false);
 const requests=useRef(createRequestGate());
 useEffect(()=>{const gate=requests.current;return()=>gate.cancel();},[]);
 useEffect(()=>{
  setRows([]);if(query.length<2||selected)return;
  const controller=new AbortController();let active=true;
  const timer=setTimeout(()=>{api<{destinations:typeof rows}>(`/api/travel/destinations?q=${encodeURIComponent(query)}`,undefined,undefined,controller.signal).then(data=>{if(active){setRows(data.destinations);setMessage(data.destinations.length?"":"No destination found. Try another city.");}}).catch(e=>{if(active)setMessage(e.message);});},300);
  return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[query,selected]);
 async function choose(city:{region_id:string;label:string},next=0){
  const request=requests.current.begin();setLoading(true);setDraft(current=>({...current,selected:city,query:city.label}));setRows([]);setMessage("Loading properties…");onSelect("");
  try{
   const data=await guardedApi<{hotelIds:string[];hasMore:boolean}>(request,"/api/travel/destination-hotels",{regionId:city.region_id,page:next});
   setDraft(current=>({...current,page:next,hasMore:data.hasMore}));onSelect(data.hotelIds.join(","));setMessage(`${data.hotelIds.length} properties in group ${next+1}`);
  }catch(e){if(request.isCurrent())setMessage(e instanceof Error?e.message:"Destination unavailable.");}
  finally{if(request.isCurrent())setLoading(false);}
 }
 return <View><Field label="Destination" value={query} onChange={value=>{requests.current.cancel();setLoading(false);setMessage("");setDraft({query:value,selected:null,page:0,hasMore:false});onSelect("");}} placeholder="Search city, e.g. Mumbai"/>{rows.map(city=><Button key={city.region_id} title={city.label} secondary disabled={loading} onPress={()=>void choose(city)}/>)}{selected&&<View><Button title={loading?"Loading destination…":"Refresh destination properties"} secondary disabled={loading} onPress={()=>void choose(selected,page)}/>{page>0&&<Button title="Previous hotel group" secondary disabled={loading} onPress={()=>void choose(selected,page-1)}/>}{hasMore&&<Button title="Next hotel group" secondary disabled={loading} onPress={()=>void choose(selected,page+1)}/>}</View>}{message!==""&&<Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text>}</View>;
}
type CancelOffer={
 id:string;status:string;is_partial:boolean;
 scope?:{trips?:{src:string;dest:string;departureDate:string;travellers:{fn:string;ln:string}[]}[]};
 refund_offer_minor:string|null;penalty_minor:string|null;offer_version:string|null;
 offer_expires_at:string|null;accepted_at:string|null;review_note:string|null;
};
function CancellationOffer({bookingId,revision}:{bookingId:string;revision:number}){
 const [offers,setOffers]=useState<CancelOffer[]>([]);
 const [acceptedVersion,setAcceptedVersion]=useState<string|null>(null);
 const [feedback,setFeedback]=useState<{text:string;tone:"success"|"error"}|null>(null);
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[retry,setRetry]=useState(0);
 const mounted=useRef(true),working=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController();
  setLoaded(false);
  setFeedback(null);
  api<{requests:CancelOffer[]}>(`/api/bookings/${bookingId}/cancellation-offer`,undefined,undefined,controller.signal)
   .then(result=>{if(!controller.signal.aborted){setOffers(result.requests);setLoaded(true);}})
   .catch(e=>{if(!controller.signal.aborted){
    setOffers([]);
    setFeedback({text:e instanceof Error?e.message:"Unable to load cancellation.",tone:"error"});
   }});
  return()=>controller.abort();
 },[bookingId,revision,retry]);
 async function accept(offer:CancelOffer){
  if(working.current||!loaded||!offer.offer_version||acceptedVersion!==offer.offer_version)return;
  if(!offer.offer_expires_at||isQuoteExpired(offer.offer_expires_at)){
   setFeedback({text:"This offer has expired. Refresh cancellation updates or contact support.",tone:"error"});
   return;
  }
  working.current=true;setBusy(true);setFeedback(null);
  try{
   await api<{message:string}>(`/api/bookings/${bookingId}/cancellation-offer`,{offerVersion:offer.offer_version});
   if(!mounted.current)return;
   setOffers(current=>current.map(row=>row.offer_version===offer.offer_version?{...row,accepted_at:new Date().toISOString()}:row));
   setAcceptedVersion(null);
   setFeedback({text:"Cancellation terms accepted. The booking remains active until supplier confirmation.",tone:"success"});
  }catch(e){
   if(mounted.current){
    setAcceptedVersion(null);
    setLoaded(false);
    setFeedback({text:`${e instanceof Error?e.message:"Unable to confirm acceptance."} Refresh cancellation updates to check whether these terms were accepted.`,tone:"error"});
   }
  }finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 return <View>
  <Button title="Refresh cancellation updates" secondary disabled={busy} onPress={()=>setRetry(current=>current+1)}/>
  {!loaded&&!feedback&&<Text accessibilityLiveRegion="polite" style={styles.caption}>Checking cancellation updates…</Text>}
  {loaded&&offers.length===0&&<Text style={styles.body}>No cancellation requests for this booking.</Text>}
  {loaded&&offers.map(offer=>{
   const eligible=offer.status==="AWAITING_ACCEPTANCE"&&!offer.accepted_at&&Boolean(offer.offer_version)&&Boolean(offer.offer_expires_at&&!isQuoteExpired(offer.offer_expires_at));
   const checked=Boolean(offer.offer_version)&&acceptedVersion===offer.offer_version;
   return <View style={styles.fare} key={offer.id}>
    <Text style={styles.status}>{offer.status.replaceAll("_"," ")}</Text>
    <Text style={styles.caption}>{offer.is_partial?"Partial cancellation":"Remaining booking cancellation"}</Text>
    {offer.scope?.trips?.map((trip,i)=><Text key={i} style={styles.body}>{trip.src} → {trip.dest} · {trip.departureDate} · {trip.travellers.map(t=>`${t.fn} ${t.ln}`).join(", ")}</Text>)}
    {offer.review_note&&<Text style={styles.body}>{offer.review_note}</Text>}
    {offer.refund_offer_minor!==null&&<Text style={styles.body}>Estimated refund {amount(Number(offer.refund_offer_minor))}{offer.penalty_minor!==null?` · Remaining value or retained charges ${amount(Number(offer.penalty_minor))}`:""}</Text>}
    {offer.offer_expires_at&&<Text style={styles.caption}>Valid until {new Date(offer.offer_expires_at).toLocaleString()}</Text>}
    {eligible&&<>
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked,disabled:busy}} disabled={busy} onPress={()=>setAcceptedVersion(checked?null:offer.offer_version)} style={styles.checkbox}><Text style={styles.body}>{checked?"☑":"☐"} I accept these cancellation charges and estimated refund.</Text></Pressable>
     <Button title="Accept cancellation terms" disabled={busy||!checked} onPress={()=>void accept(offer)}/>
    </>}
    {offer.accepted_at&&<Text style={styles.caption}>Terms accepted. Supplier confirmation is required before travel is cancelled.</Text>}
   </View>;
  })}
  {feedback&&<Text accessibilityRole="alert" style={feedback.tone==="error"?styles.error:styles.success}>{feedback.text}</Text>}
 </View>;
}
type CancellationOptions={trips:{src:string;dest:string;departureDate:string}[];travellers:{fn:string;ln:string}[];cancelledUnits:string[]};
type CancellationPayload={reason:string;requestKey:string;selection?:{tripIndex:number;travellerIndexes:number[]}[]};
function NativeCancellationRequest({bookingId,product,onSubmitted}:{bookingId:string;product:string;onSubmitted:()=>void}){
 const [options,setOptions]=useState<CancellationOptions|null>(null),[selected,setSelected]=useState<string[]>([]);
 const [partial,setPartial]=useState(false),[reason,setReason]=useState(""),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(""),[uncertain,setUncertain]=useState(false);
 const attempt=useRef<CancellationPayload|null>(null),working=useRef(false);
 const requests=useRef(createRequestGate());
 useEffect(()=>{const gate=requests.current;return()=>gate.cancel();},[]);
 const guardId=useId(),registerGuard=useContext(NavigationGuardContext),parentBusy=useContext(BusyContext);
 useEffect(()=>{
  registerGuard(guardId,busy||uncertain,uncertain?"Check or retry the existing cancellation request before leaving My trips.":"Wait for the cancellation request to finish.");
  return()=>registerGuard(guardId,false,"");
 },[busy,uncertain,registerGuard,guardId]);
 async function load(){
  if(working.current||attempt.current)return;
  working.current=true;setBusy(true);setMessage("");
  const request=requests.current.begin();
  try{
   const response=await guardedApi<CancellationOptions>(request,`/api/bookings/${bookingId}/cancellation-options`);
   setOptions(response);setSelected([]);setPartial(true);
  }catch(e){if(request.isCurrent())setMessage(e instanceof Error?e.message:"Unable to load passenger options.");}
  finally{working.current=false;if(request.isCurrent())setBusy(false);}
 }
 async function submit(){
  if(working.current)return;
  const previous=attempt.current;
  const cleanReason=reason.trim();
  const selection=partial?options?.trips.flatMap((_,tripIndex)=>{
   const travellerIndexes=options.travellers.flatMap((_,i)=>selected.includes(`${tripIndex}:${i}`)?[i]:[]);
   return travellerIndexes.length?[{tripIndex,travellerIndexes}]:[];
  }):undefined;
  if(!previous&&(cleanReason.length<3||cleanReason.length>1000)){setMessage("Enter a cancellation reason between 3 and 1,000 characters.");return;}
  if(!previous&&partial&&!selection?.length){setMessage("Select passengers and flights first.");return;}
  working.current=true;setBusy(true);setMessage("");
  const request=requests.current.begin();
  try{
   attempt.current=previous??{reason:cleanReason,requestKey:Crypto.randomUUID(),...(selection?{selection}:{})};
   const result=await guardedApi<{message:string}>(request,`/api/bookings/${bookingId}/cancellation`,attempt.current);
   if(typeof result.message!=="string")throw Error("Cancellation response could not be confirmed.");
   attempt.current=null;setUncertain(false);setMessage(result.message);
   setOptions(null);setPartial(false);setSelected([]);setReason("");onSubmitted();
  }catch(e){
   if(!request.isCurrent())return;
   const rejected=!previous&&e instanceof ApiHttpError&&e.hasServerError&&[400,404,409,413,415,422].includes(e.status);
   if(rejected)attempt.current=null;
   if(attempt.current){
    setUncertain(true);
    setMessage("We couldn’t confirm whether your request was received. Retry the existing request below. Your selection is preserved.");
   }else setMessage(e instanceof Error?e.message:"Unable to send the cancellation request.");
  }finally{working.current=false;if(request.isCurrent())setBusy(false);}
 }
 return <View>
  <Text style={styles.cardTitle}>Cancel travel</Text>
  <Text style={styles.caption}>Travel remains active until cancellation is confirmed. Our team will send charges for your acceptance.</Text>
  <BusyContext.Provider value={parentBusy||busy||uncertain}>
   {product==="FLIGHT"&&<><Button title="All remaining travel" secondary={partial} onPress={()=>setPartial(false)}/><Button title="Choose passengers / flights" secondary={!partial} onPress={()=>void load()}/></>}
   {partial&&options&&(!options.trips.length?<Text style={styles.caption}>Contact support for partial cancellation of this booking.</Text>:options.trips.map((trip,ti)=><View key={ti} style={styles.fare}>
    <Text style={styles.label}>{trip.src} → {trip.dest} · {trip.departureDate}</Text>
    {options.travellers.map((traveller,pi)=>{
     const unit=`${ti}:${pi}`,cancelled=options.cancelledUnits.includes(unit),disabled=cancelled||busy||uncertain||parentBusy;
     const checked=selected.includes(unit);
     return <Pressable key={pi} accessibilityRole="checkbox" accessibilityState={{checked,disabled}} disabled={disabled} style={styles.checkbox} onPress={()=>setSelected(current=>checked?current.filter(value=>value!==unit):[...current,unit])}><Text style={styles.body}>{checked?"☑":"☐"} {traveller.fn} {traveller.ln}{cancelled?" · Already cancelled":""}</Text></Pressable>;
    })}
   </View>))}
   <Field label="Reason for cancellation" value={reason} onChange={setReason}/>
  </BusyContext.Provider>
  <Button title={busy?"Working…":uncertain?"Retry existing cancellation request":"Request cancellation terms"} secondary disabled={busy} onPress={()=>void submit()}/>
  {message!==""&&<Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
 </View>;
}
function CancellationTools({trip}:{trip:Trip}){
 const [open,setOpen]=useState(false),[revision,setRevision]=useState(0);
 return <View>
  {trip.service_kind!=="ANCILLARY"&&["TICKETED","CONFIRMED"].includes(trip.status)&&<NativeCancellationRequest bookingId={trip.id} product={trip.product} onSubmitted={()=>{setOpen(true);setRevision(value=>value+1);}}/>}
  {!open?<Button title="Show cancellation updates" secondary onPress={()=>setOpen(true)}/>:<CancellationOffer bookingId={trip.id} revision={revision}/>}
 </View>;
}
type ServiceOptions={trips:{src:string;dest:string;departureDate:string}[];travellers:{fn:string;ln:string}[];cancelledUnits:string[];reissued:boolean};
type ServiceSegment={id:string;label:string;pax:{id:string;name:string;blockedKinds?:string[]}[];options:{kind:string;code:string;label:string;amountMinor:number}[]};
type ServiceSearch={searchId:string;results:{segments?:ServiceSegment[];searchResult?:{tripInfos:Record<string,Flight[]>}}};
type ServiceQuote={quoteId:string;kind:string;totalMinor:number;expiresAt:string;review:unknown};
function NativeFlightServices({bookingId}:{bookingId:string}){
 const [kind,setKind]=useState<"REISSUE"|"ANCILLARY"|null>(null),[options,setOptions]=useState<ServiceOptions|null>(null),[search,setSearch]=useState<ServiceSearch|null>(null),[quote,setQuote]=useState<ServiceQuote|null>(null),[trip,setTrip]=useState(0),[people,setPeople]=useState<number[]>([]),[newDate,setNewDate]=useState(""),[choices,setChoices]=useState<Record<string,string>>({}),[segmentIndex,setSegmentIndex]=useState(0),[paxIndex,setPaxIndex]=useState(0),[extraKind,setExtraKind]=useState("MEAL"),[filter,setFilter]=useState(""),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [billing,setBilling]=useState(emptyBilling);
 const paymentSafety=useContext(PaymentSafetyContext),parentBusy=useContext(BusyContext),registerGuard=useContext(NavigationGuardContext),guardId=useId(),[error,setError]=useState("");
 const guard=useCallback((blocked:boolean,message:string)=>registerGuard(guardId,blocked,message),[registerGuard,guardId]);
 const conditions=serviceConditions(quote?.review);
 const requests=useRef(createRequestGate()),working=useRef(false);
 useEffect(()=>{const gate=requests.current;return()=>gate.cancel();},[]);
 useEffect(()=>{guard(Boolean(kind),"Close or finish your flight service changes before leaving this screen.");return()=>guard(false,"");},[kind,guard]);
 async function run(work:(request:RequestContext)=>Promise<void>){if(working.current)return;working.current=true;const request=requests.current.begin();setBusy(true);setMessage("");setError("");try{await work(request);}catch(e){if(request.isCurrent())setError(e instanceof Error?e.message:"Flight service unavailable.");}finally{if(request.isCurrent()){working.current=false;setBusy(false);}}}
 function close(){if(busy)return;requests.current.cancel();setKind(null);setOptions(null);setSearch(null);setQuote(null);setChoices({});setPeople([]);setNewDate("");setFilter("");setBilling(emptyBilling);setConsent(false);setMessage("");setError("");}
 async function open(next:"REISSUE"|"ANCILLARY"){if(working.current||paymentSafety.blocked)return;setKind(next);setOptions(null);setSearch(null);setQuote(null);setChoices({});setPeople([]);setTrip(0);setSegmentIndex(0);setPaxIndex(0);setNewDate("");setFilter("");setBilling(emptyBilling);setConsent(false);await run(async request=>{if(next==="REISSUE")setOptions(await guardedApi<ServiceOptions>(request,`/api/bookings/${bookingId}/services`));else setSearch(await guardedApi<ServiceSearch>(request,`/api/bookings/${bookingId}/services`,{kind:next}));});}
 async function review(data:object){if(paymentSafety.blocked)return;await run(async request=>{setQuote(await guardedApi<ServiceQuote>(request,"/api/travel/service-review",{searchId:search?.searchId,...data}));setConsent(false);});}
 const segment=search?.results.segments?.[segmentIndex],pax=segment?.pax[paxIndex];const choiceKey=segment&&pax?`${segment.id}:${pax.id}:${extraKind}`:"";
 return <BusyContext.Provider value={parentBusy||busy||paymentSafety.blocked}><View><Text style={styles.cardTitle}>Flight services</Text>{kind?<BusyContext.Provider value={parentBusy||busy}><Button title={quote||people.length||newDate||Object.keys(choices).length?"Discard and close service options":"Close service options"} secondary onPress={close}/></BusyContext.Provider>:<><Button title="Add seats, meals & baggage" secondary onPress={()=>void open("ANCILLARY")}/><Button title="Reschedule flight" secondary onPress={()=>void open("REISSUE")}/></>}
 {kind&&error&&!options&&!search&&!quote&&<Button title="Retry flight service options" secondary onPress={()=>void open(kind)}/>}
 {kind==="REISSUE"&&options&&!search&&!quote&&<View><Text style={styles.caption}>One trip at a time, once per booking. Original travel stays active until the replacement ticket is confirmed.</Text>{options.trips.map((t,i)=><Button key={i} title={`${t.src} → ${t.dest} · ${t.departureDate}`} secondary={trip!==i} onPress={()=>{setTrip(i);setPeople([]);}}/>)}<Field label="New departure date" value={newDate} onChange={setNewDate} placeholder="YYYY-MM-DD"/>{options.travellers.map((p,i)=><Pressable key={i} accessibilityRole="checkbox" style={styles.checkbox} accessibilityState={{checked:people.includes(i),disabled:parentBusy||busy||paymentSafety.blocked||options.cancelledUnits.includes(`${trip}:${i}`)}} disabled={parentBusy||paymentSafety.blocked||options.cancelledUnits.includes(`${trip}:${i}`)||busy} onPress={()=>setPeople(current=>current.includes(i)?current.filter(index=>index!==i):[...current,i])}><Text style={styles.body}>{people.includes(i)?"☑":"☐"} {p.fn} {p.ln}</Text></Pressable>)}<Button title="Search replacement flights" disabled={busy||!people.length||options.reissued} onPress={()=>void run(async request=>setSearch(await guardedApi<ServiceSearch>(request,`/api/bookings/${bookingId}/services`,{kind,tripIndex:trip,date:newDate,travellerIndexes:people})))}/>{options.reissued&&<Text style={styles.caption}>This booking has already been reissued.</Text>}</View>}
 {kind==="REISSUE"&&search&&!quote&&!Object.values(search.results.searchResult?.tripInfos??{}).some(flights=>flights.length>0)&&<Text style={styles.body}>No replacement flights were found. Try a different departure date.</Text>}
 {kind==="REISSUE"&&search&&!quote&&<Button title="Change replacement search" secondary onPress={()=>setSearch(null)}/>}
 {kind==="REISSUE"&&search&&!quote&&Object.values(search.results.searchResult?.tripInfos??{}).flat().map((flight,i)=><View key={i} style={styles.fare}><Text style={styles.label}>{flight.sI.map(s=>`${s.da.code} → ${s.aa.code} · ${s.dt}`).join(" | ")}</Text>{flight.totalPriceList.map(fare=><Button key={fare.id} title={`${fare.fareIdentifier} · ${typeof fare.customerEstimateMinor==="number"?amount(fare.customerEstimateMinor):"Price at review"} additional · Review`} secondary disabled={busy} onPress={()=>void review({priceId:fare.id})}/>)}</View>)}
 {kind==="ANCILLARY"&&search&&!quote&&<View><Text style={styles.caption}>Baggage covers connecting segments; select once per trip. Infants cannot add extras. Exit-row seats require an eligible, able adult.</Text>{search.results.segments?.map((seg,i)=><Button key={seg.id} title={seg.label} secondary={segmentIndex!==i} onPress={()=>{setSegmentIndex(i);setPaxIndex(0);}}/>)}{segment?.pax.map((person,i)=><Button key={person.id} title={person.name} secondary={paxIndex!==i} onPress={()=>setPaxIndex(i)}/>)}{["MEAL","BAGGAGE","SEAT"].map(type=><Button key={type} title={type} secondary={extraKind!==type} onPress={()=>setExtraKind(type)}/>)}<Field label="Find an option or seat" value={filter} onChange={setFilter}/><Button title="No addition for this passenger / segment" secondary onPress={()=>setChoices(current=>({...current,[choiceKey]:""}))}/>{pax&&segment?.options.filter(o=>o.kind===extraKind&&!pax.blockedKinds?.includes(extraKind)&&o.label.toLowerCase().includes(filter.toLowerCase())).slice(0,60).map(o=><Button key={o.code} title={`${choices[choiceKey]===o.code?"✓ ":""}${o.label} · ${amount(o.amountMinor)}`} secondary disabled={busy} onPress={()=>setChoices(current=>({...current,[choiceKey]:o.code}))}/>)}<Text style={styles.caption}>{Object.values(choices).filter(Boolean).length} additions selected. Search by seat number to find more seats.</Text><Button title="Review extras total" disabled={busy||!Object.values(choices).some(Boolean)} onPress={()=>{const selections=(search.results.segments??[]).flatMap(seg=>seg.pax.flatMap(person=>["MEAL","BAGGAGE","SEAT"].flatMap(type=>{const code=choices[`${seg.id}:${person.id}:${type}`];return code?[{segmentId:seg.id,paxId:person.id,kind:type,code}]:[];})));void review({choices:selections});}}/></View>}
 {paymentSafety.blocked&&<Text accessibilityRole="alert" style={styles.message}>Payment confirmation is required. Check the linked booking in My trips or contact support. Do not pay again or start a replacement request.</Text>}{quote&&<View><Text style={styles.price}>{amount(quote.totalMinor)} additional payable</Text><Text style={styles.caption}>Expires {new Date(quote.expiresAt).toLocaleTimeString()}</Text><Text style={styles.cardTitle}>Supplier conditions & notices</Text>{conditions.lines.map((line,index)=><Text key={index} style={styles.policy}>{line.label}: {line.text}</Text>)}{conditions.blocked&&<Text accessibilityRole="alert" style={styles.message}>Some supplier terms could not be safely displayed. Confirmation is unavailable; contact support to review the complete terms.</Text>}{quote.totalMinor>0&&paymentSafety.gateway?.provider==="PAYGLOCAL"&&<BillingFields value={billing} onChange={v=>{setBilling(v);setConsent(false);}} disabled={busy||paymentSafety.blocked}/>}<Pressable accessibilityRole="checkbox" style={styles.checkbox} accessibilityState={{checked:consent,disabled:parentBusy||busy||paymentSafety.blocked||conditions.blocked}} disabled={parentBusy||busy||paymentSafety.blocked||conditions.blocked} onPress={()=>setConsent(!consent)}><Text style={styles.body}>{consent?"☑":"☐"} I accept the additional total, supplier conditions and seat eligibility.</Text></Pressable><Button title={quote.totalMinor?"Confirm & pay":"Confirm request"} disabled={busy||!consent||paymentSafety.blocked||conditions.blocked||(quote.totalMinor>0&&!paymentSafety.gateway?.configured)} onPress={()=>void run(async request=>{if(conditions.blocked)throw Error("Supplier terms are unavailable. Contact support before confirming.");if(isQuoteExpired(quote.expiresAt))throw Error("This service review has expired. Review again before paying.");if(quote.totalMinor>0&&!paymentSafety.gateway?.configured)throw Error("Secure payment is currently unavailable. No payment was started.");const billingData=quote.totalMinor>0&&paymentSafety.gateway?.provider==="PAYGLOCAL"?checkedBilling(billing):undefined;if(!await paymentSafety.start(quote.quoteId))throw Error("Check the previous payment attempt in My trips before retrying.");try{const payment=checkedPayment(await guardedApi<unknown>(request,"/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor,returnChannel:"APP",...(billingData?{billingData}:{})}),quote.totalMinor);if(!payment.free){if(isQuoteExpired(quote.expiresAt))throw Error("The service review expired while preparing payment. Check My trips; do not pay this stale review.");if(!await openPayment(request,payment,"Max Travel · Flight services")){setMessage("Secure checkout opened. Check My trips for verified payment and supplier confirmation.");return;}}await paymentSafety.verified(quote.quoteId);setQuote(null);setKind(null);setSearch(null);setMessage("Request received. The linked booking will show supplier confirmation.");}finally{paymentSafety.refresh();}})}/>
 <Button title="Change service selection" secondary onPress={()=>{setQuote(null);setConsent(false);setError("");}}/></View>}
 {busy&&<ActivityIndicator color={COLORS.action}/>}{error!==""&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}{message!==""&&<Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text>}</View></BusyContext.Provider>;
}
function NativeApp({sessionState}:{sessionState:ReturnType<typeof authClient.useSession>}){
 const {data:session,isPending,refetch}=sessionState;
 const unavailableSession=Boolean(session&&sessionState.error);
 const [tab,setTab]=useState<Tab>("Home"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[searchError,setSearchError]=useState(""),[payError,setPayError]=useState(""),[authError,setAuthError]=useState("");
 const [billing,setBilling]=useState(emptyBilling),[gateway,setGateway]=useState<GatewayConfig|null>(null),[gatewayError,setGatewayError]=useState(""),[gatewayLoading,setGatewayLoading]=useState(true),[gatewayRetry,setGatewayRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setGatewayLoading(true);setGatewayError("");setGateway(null);api<GatewayConfig>("/api/payments/config",undefined,"GET",controller.signal).then(value=>{if(!controller.signal.aborted)setGateway(value);}).catch(e=>{if(!controller.signal.aborted)setGatewayError(e instanceof Error?e.message:"Payment status could not be checked.");}).finally(()=>{if(!controller.signal.aborted)setGatewayLoading(false);});return()=>controller.abort();},[gatewayRetry]);
 const [hotelRooms,setHotelRooms]=useState([{adults:"2",ages:""}]);const [extrasPending,setExtrasPending]=useState(false);
 const [multiCity,setMultiCity]=useState(false),[extraLegs,setExtraLegs]=useState([{from:"",to:"",date:""}]);
 const [children,setChildren]=useState("0"),[infants,setInfants]=useState("0"),[returnDate,setReturnDate]=useState(""),[selectedFares,setSelectedFares]=useState<Record<string,string>>({});
 const [product,setProduct]=useState<"FLIGHT"|"HOTEL">("FLIGHT"),[from,setFrom]=useState("BOM"),[to,setTo]=useState("DEL"),[date,setDate]=useState(""),[end,setEnd]=useState(""),[hotelIds,setHotelIds]=useState(""),[nationality,setNationality]=useState("106"),[adults,setAdults]=useState("1");
 const [results,setResults]=useState<Results|null>(null),[roomList,setRoomList]=useState<{hid:string;rooms:Room[]}|null>(null),[quote,setQuote]=useState<Quote|null>(null),[guests,setGuests]=useState<Guest[]>([{ti:"Mr",pt:"ADULT",fN:"",lN:""}]);
 const [recovery,setRecovery]=useState(false);
 const [gstNumber,setGstNumber]=useState(""),[gstName,setGstName]=useState(""),[gstAddress,setGstAddress]=useState(""),[emergencyName,setEmergencyName]=useState(""),[emergencyEmail,setEmergencyEmail]=useState(""),[emergencyPhone,setEmergencyPhone]=useState("");
 const [email,setEmail]=useState(""),[phone,setPhone]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState(""),[code,setCode]=useState(""),[authMode,setAuthMode]=useState<"signin"|"signup"|"reset"|"challenge">("signin");
 const [tripPage,setTripPage]=useState(1),[moreTrips,setMoreTrips]=useState(false);
 const [trips,setTrips]=useState<Trip[]>([]),[saved,setSaved]=useState<{id:string;name:string;profile:Guest}[]>([]),[consent,setConsent]=useState(false);
 const [destinationDraft,setDestinationDraft]=useState<DestinationState>({query:"",selected:null,page:0,hasMore:false});
 const [nationalityLabel,setNationalityLabel]=useState("India");
 const [searchSummary,setSearchSummary]=useState("");
 const [selectionError,setSelectionError]=useState("");
 const [busyLabel,setBusyLabel]=useState("");
 const [tripsLoading,setTripsLoading]=useState(false),[tripsError,setTripsError]=useState("");
 const [tripsRefresh,setTripsRefresh]=useState(0);
 const [clockNow,setClockNow]=useState(Date.now());
 const sessionId=session?.user.id;
 const paymentGuard=useRef(createPaymentRecovery({get:SecureStore.getItemAsync,set:SecureStore.setItemAsync,remove:SecureStore.deleteItemAsync},sessionId?`maxtravel.pending-quote.${sessionId}`:null));
 const [recoveryState,setRecoveryState]=useState(paymentGuard.current.snapshot());
 const [recoveryMessage,setRecoveryMessage]=useState("");
 const [recoveryRefresh,setRecoveryRefresh]=useState(0);
 const [canResumePayment,setCanResumePayment]=useState(false);
 const refreshPayment=useCallback(()=>setRecoveryRefresh(current=>current+1),[]);
 const paymentAttempted=Boolean(sessionId)&&(!recoveryState.hydrated||recoveryState.quoteId!==null||unavailableSession);
 const startPayment=async(quoteId:string)=>{
  try{return await paymentGuard.current.start(quoteId);}
  catch{throw Error("Couldn’t save payment recovery on this device. No payment was started. Try again.");}
  finally{setRecoveryState(paymentGuard.current.snapshot());}
 };
 const paymentVerified=async(quoteId:string)=>{await paymentGuard.current.verified(quoteId);setRecoveryState(paymentGuard.current.snapshot());setRecoveryMessage("");};
 useEffect(()=>{
  let active=true;
  paymentGuard.current.hydrate().then(()=>{if(active)setRecoveryState(paymentGuard.current.snapshot());}).catch(()=>{if(active)setRecoveryMessage("Payment recovery could not be read. Booking remains locked; reopen the app or contact support.");});
  return()=>{active=false;};
 },[]);
 const requests=useRef(createRequestGate()),busyRef=useRef(false),paymentLocked=useRef(false),tabHistory=useRef<Tab[]>([]),navigationGuards=useRef(new Map<string,string>());
 const [navigationMessage,setNavigationMessage]=useState("");
 const scrollView=useRef<ScrollView>(null);
 const searchId=results?.searchId,roomHotelId=roomList?.hid,quoteId=quote?.quoteId;
 useEffect(()=>{scrollView.current?.scrollTo({y:0,animated:false});},[tab,searchId,roomHotelId,quoteId]);
 const registerNavigationGuard=useCallback((id:string,blocked:boolean,message:string)=>{
  if(blocked)navigationGuards.current.set(id,message);
  else if(navigationGuards.current.delete(id))setNavigationMessage("");
 },[]);
 const updateExtrasPending=useCallback((pending:boolean)=>{setExtrasPending(pending);if(!pending)setNavigationMessage("");},[]);
 const returnToTrips=useRef<()=>void>(()=>{});
 const discardCompletedBooking=useCallback(()=>{
  setResults(null);setRoomList(null);setQuote(null);setGuests([]);setSelectedFares({});setSearchSummary("");setConsent(false);setExtrasPending(false);
 },[]);
 useEffect(()=>{
  const pendingQuote=recoveryState.quoteId;
  if(!recoveryState.hydrated||!pendingQuote||!sessionId||sessionState.error)return;
  let active=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const check=async()=>{
   setCanResumePayment(false);
   try{
    const raw=await api<unknown>(`/api/payments/status?quoteId=${encodeURIComponent(pendingQuote)}`,undefined,undefined,controller.signal);
    if(!active)return;
    const status=checkedPaymentRecovery(raw,pendingQuote);
    if(status.state==="outstanding"){
     setCanResumePayment(Boolean(status.resumable));
     setRecoveryMessage(status.message);
     if(tab==="My trips")timer=setTimeout(()=>void check(),5000);
     return;
    }
    await paymentGuard.current.verified(pendingQuote);
    if(!active)return;
    setRecoveryState(paymentGuard.current.snapshot());setRecoveryMessage("");
    if(status.state==="resolved"){
     discardCompletedBooking();
     returnToTrips.current();
    }else{
     setQuote(current=>current?.quoteId===pendingQuote?null:current);
     setConsent(false);
    }
    setMessage(status.message);
   }catch(e){
    if(!active)return;
    setRecoveryMessage(`${e instanceof Error?e.message:"Payment status unavailable."} The previous attempt is still locked; do not pay again.`);
    if(tab==="My trips")timer=setTimeout(()=>void check(),15000);
   }
  };
  void check();return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[recoveryState.hydrated,recoveryState.quoteId,sessionId,sessionState.error,tab,recoveryRefresh,discardCompletedBooking]);
 const searchKey=JSON.stringify({product,from,to,date,end,adults,children,infants,returnDate,multiCity,extraLegs,hotelIds,nationality,hotelRooms});
 const cancelWork=useCallback(()=>{requests.current.cancel();busyRef.current=false;paymentLocked.current=false;setBusy(false);setBusyLabel("");},[]);
 useEffect(()=>{const gate=requests.current;return()=>gate.cancel();},[]);
 useEffect(()=>{
  cancelWork();setResults(null);setRoomList(null);setQuote(null);setGuests([]);setSelectedFares({});setConsent(false);setExtrasPending(false);setSearchSummary("");
 },[searchKey,cancelWork]);
 useEffect(()=>{if(!quote)return;setClockNow(Date.now());const timer=setInterval(()=>setClockNow(Date.now()),1000);return()=>clearInterval(timer);},[quote]);
 const quoteExpired=!!quote&&isQuoteExpired(quote.expiresAt,clockNow);
 const navigate=useCallback((next:Tab,force=false,back=false)=>{
  if(next===tab)return;
  if(paymentLocked.current&&!force){setNavigationMessage("Complete or check this payment before leaving checkout.");return;}
  if(busyRef.current&&!force){setNavigationMessage("Please wait for the current action to finish before leaving this screen.");return;}
  const unsaved=extrasPending?"Apply or discard your unapplied flight extras before leaving checkout.":navigationGuards.current.values().next().value;
  if(!force&&unsaved){setNavigationMessage(unsaved);return;}
  if(back)tabHistory.current.pop();
  else if(next==="Home")tabHistory.current=[];
  else tabHistory.current.push(tab);
  cancelWork();if(next==="My trips"){setTripPage(1);setTrips([]);setTripsLoading(true);setTripsError("");setMoreTrips(false);}
  setTab(next);setMessage("");setNavigationMessage("");
 },[tab,extrasPending,cancelWork]);
 const paymentReturn=useRef<()=>void>(()=>{});
 useEffect(()=>{
  returnToTrips.current=()=>navigate("My trips",true);
  paymentReturn.current=()=>navigate("My trips");
 },[navigate]);
 useEffect(()=>{
  const refresh=refreshPayment;
  const state=AppState.addEventListener("change",next=>{if(next==="active"){refresh();setTripsRefresh(current=>current+1);}});
  const receiveUrl=({url}:{url:string})=>{
   if(url!=="maxtravel://checkout-return"&&url!=="maxtravel://checkout-return/")return;
   paymentReturn.current();refresh();
  };
  const link=Linking.addEventListener("url",receiveUrl);
  let active=true;
  Linking.getInitialURL().then(url=>{if(active&&url)receiveUrl({url});}).catch(()=>{});
  return()=>{active=false;state.remove();link.remove();};
 },[refreshPayment]);
 useEffect(()=>{const subscription=BackHandler.addEventListener("hardwareBackPress",()=>{
  if(paymentLocked.current||busyRef.current)return true;
  if(tab==="Book"&&quote){
   if(extrasPending&&!isQuoteExpired(quote.expiresAt)){setNavigationMessage("Apply or discard your unapplied flight extras before leaving checkout.");return true;}
   if(paymentGuard.current.isBlocked()){navigate("My trips");return true;}
   setQuote(null);setConsent(false);setExtrasPending(false);return true;
  }
  if(tab==="Book"&&roomList){setRoomList(null);setSelectionError("");return true;}
  if(tab==="Book"&&results){setResults(null);setSelectedFares({});setSearchSummary("");setSelectionError("");return true;}
  const unsaved=navigationGuards.current.values().next().value;
  if(unsaved){setNavigationMessage(unsaved);return true;}
  if(tab==="Home")return false;
  navigate(tabHistory.current.at(-1)??"Home",false,true);return true;
 });return()=>subscription.remove();},[tab,quote,results,roomList,extrasPending,navigate]);
 useEffect(()=>{
  if(tab!=="My trips"||!sessionId||unavailableSession)return;
  const controller=new AbortController();let active=true;let timer:ReturnType<typeof setTimeout>;
  setTripsLoading(true);setTripsError("");
  const load=async()=>{
   if(AppState.currentState==="background"||AppState.currentState==="inactive")return;
   try{
    const pages=await Promise.all(Array.from({length:tripPage},(_,index)=>api<{bookings:Trip[];hasMore:boolean}>(`/api/bookings?page=${index+1}`,undefined,undefined,controller.signal)));
    if(!active)return;
    const bookings=mergeTripPage([],pages.flatMap(page=>page.bookings),1);
    setTrips(bookings);setMoreTrips(pages[pages.length-1].hasMore);setTripsError("");
    if(bookings.some(booking=>["PAYMENT_PENDING","PAID","BOOKING_PENDING","MANUAL_REVIEW","CANCELLATION_PENDING"].includes(booking.status))){
     timer=setTimeout(()=>void load(),Math.max(5000,tripPage*5000));
    }
   }catch(e){
    if(!active)return;
    if(e instanceof ApiHttpError&&(e.status===401||e.status===403)){
     setTrips([]);setMoreTrips(false);setMessage("");
     setTripsError("Trip access could not be verified. Check your account before opening private trips.");
     return;
    }
    setTripsError(e instanceof Error?e.message:"Unable to load trips.");
    timer=setTimeout(()=>void load(),Math.max(15000,tripPage*5000));
   }finally{if(active)setTripsLoading(false);}
  };
  void load();return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[tab,sessionId,tripPage,tripsRefresh,unavailableSession]);
 async function run(action:(request:RequestContext)=>Promise<void>,label="Working…",lockNavigation=false,onError?:(message:string)=>void){
  if(busyRef.current)return;
  busyRef.current=true;paymentLocked.current=lockNavigation;
  const request=requests.current.begin();setBusy(true);setBusyLabel(label);setMessage("");onError?.("");
  try{await action(request);}catch(e){if(request.isCurrent()){const text=e instanceof Error?e.message:"Unable to complete this action.";if(onError)onError(text);else setMessage(text);}}
  finally{if(request.isCurrent()){busyRef.current=false;paymentLocked.current=false;setBusy(false);setBusyLabel("");setNavigationMessage("");}}
 }
 function selectProduct(next:"FLIGHT"|"HOTEL"){if(busyRef.current||unavailableSession||(sessionId&&paymentGuard.current.isBlocked()))return;setProduct(next);setResults(null);setRoomList(null);setQuote(null);setConsent(false);setSearchError("");}
 function changeSearch(){setResults(null);setRoomList(null);setSelectedFares({});setSearchSummary("");setSearchError("");setSelectionError("");setPayError("");}
 async function search(){
  setSearchError("");
  if(!session||unavailableSession){navigate("Account");setMessage("Check your account to search and book.");return;}
  if(paymentGuard.current.isBlocked()){setSearchError("A previous payment needs checking in My trips. Do not start another booking yet.");return;}
  await run(async request=>{
   const snapshot=createSearchSnapshot({product,from,to,date,end,adults,children,infants,returnDate,multiCity,extraLegs,hotelIds,nationality,hotelRooms});
   setSelectedFares({});setQuote(null);setRoomList(null);setResults(null);setConsent(false);setExtrasPending(false);setSelectionError("");
   const data=await guardedApi<Results>(request,"/api/travel/search",snapshot.payload);
   setResults(data);setGuests(snapshot.guests);setSearchSummary(snapshot.summary);
  },"Finding available options…",false,setSearchError);
 }
 function reportSelectionError(text:string){
  setSelectionError(text);
  if(text)scrollView.current?.scrollTo({y:0,animated:true});
 }
 async function review(selection:object){
  if(paymentGuard.current.isBlocked()){setMessage("Check the previous payment in My trips before changing your booking.");return;}
  if(!results)return;
  await run(async request=>{
   const data=await guardedApi<Quote>(request,"/api/travel/review",{searchId:results.searchId,...selection});
   setQuote(data);setConsent(false);setExtrasPending(false);
  },"Checking live price and rules…",false,reportSelectionError);
 }
 async function chooseHotel(hid:string){
  if(!results)return;
  await run(async request=>{
   const detail=await guardedApi<{options:Room[]}>(request,"/api/travel/hotel-detail",{searchId:results.searchId,hid});
   setRoomList({hid,rooms:detail.options});
  },"Checking room availability…",false,reportSelectionError);
 }
 function updateGuest(index:number,key:keyof Guest,value:string){setGuests(current=>current.map((guest,i)=>i===index?{...guest,[key]:value}:guest));setConsent(false);}
 async function pay(){setPayError("");await run(async request=>{
  if(!gateway?.configured)throw Error("Secure payment is currently unavailable. No payment was started.");
  if(extrasPending)throw Error("Apply or discard your flight extras before continuing.");
  if(!quote||!consent)throw Error("Accept the reviewed total and rules before paying.");
  if(isQuoteExpired(quote.expiresAt))throw Error("This price review has expired. Change selection and review a fresh total.");
  if(paymentGuard.current.isBlocked())throw Error("Check My trips for the previous payment attempt before starting another booking.");
  const contactEmail=email.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw Error("Enter a valid contact email.");
  const contactPhone=checkedContactPhone(phone);
  const gst={number:gstNumber.trim().toUpperCase(),name:gstName.trim(),address:gstAddress.trim()};
  const emergency={name:emergencyName.trim(),email:emergencyEmail.trim(),phone:emergencyPhone.trim()};
  const finalDate=product==="HOTEL"?end:(multiCity?extraLegs.at(-1)?.date:returnDate)||date;
  checkCheckoutGuests(guests,quote.review,date,finalDate,gst,emergency);
  const billingData=gateway.provider==="PAYGLOCAL"?checkedBilling(billing,product==="FLIGHT"):undefined;
  const cleaned=guests.map(guest=>Object.fromEntries(Object.entries(guest).map(([key,value])=>[key,typeof value==="string"?value.trim():value]).filter(([,value])=>value!=="")));
  if(!await startPayment(quote.quoteId))throw Error("Check the previous payment attempt in My trips first.");
  try{
   const payment=checkedPayment(await guardedApi<unknown>(request,"/api/payments/create",{quoteId:quote.quoteId,acceptedTotalMinor:quote.totalMinor,returnChannel:"APP",...(billingData?{billingData}:{}),guests:{travellers:cleaned,email:contactEmail,phone:contactPhone,...(gst.number?{gstInfo:{gstNumber:gst.number,registeredName:gst.name,address:gst.address,email:contactEmail,mobile:contactPhone}}:{}),...(emergency.name?{contactInfo:{ecn:emergency.name,emails:[emergency.email],contacts:[emergency.phone]}}:{})}}),quote.totalMinor);
   if(payment.free)throw Error("This booking requires a paid order. Check My trips.");
   if(isQuoteExpired(quote.expiresAt))throw Error("The review expired while preparing payment. Check My trips; do not pay this stale review.");
   setBusyLabel("Complete the secure payment window…");
   if(!await openPayment(request,payment,"Max Travel",{email:contactEmail,contact:contactPhone})){
    setMessage("Secure checkout opened. Check My trips for verified payment and supplier confirmation.");
    return;
   }
   await paymentVerified(quote.quoteId);
   discardCompletedBooking();
   navigate("My trips",true);
   setMessage("Payment verified. Booking is not confirmed yet; supplier confirmation is processing.");
  }catch(e){
   if(request.isCurrent())throw Error(`${e instanceof Error?e.message:"Payment was closed or could not be verified."} Check My trips before trying again. A payment attempt does not confirm a booking.`);
  }finally{refreshPayment();}
 },"Preparing secure test payment…",true,setPayError);}
 async function resumePayment(){
  const pendingQuote=recoveryState.quoteId;
  if(!pendingQuote||!canResumePayment||sessionState.error)return;
  await run(async request=>{
   try{
    const raw=await guardedApi<unknown>(request,`/api/payments/status?quoteId=${encodeURIComponent(pendingQuote)}`);
    const status=checkedPaymentRecovery(raw,pendingQuote);
    if(status.state!=="outstanding"||!status.resumable)throw Error("The saved payment cannot be reopened right now. Check its status in My trips.");
    if(!await openPayment(request,status.resumable,"Max Travel")){
     setMessage("Secure checkout opened. Check My trips for verified payment and supplier confirmation.");
     return;
    }
    await paymentVerified(pendingQuote);
    discardCompletedBooking();
    navigate("My trips",true);
    setMessage("Payment verified. Check My trips for supplier confirmation.");
   }finally{refreshPayment();}
  },"Reopening the saved payment…",true);
 }
 return <PaymentSafetyContext.Provider value={{gateway,blocked:paymentAttempted,start:startPayment,verified:paymentVerified,refresh:refreshPayment}}><BusyContext.Provider value={busy}><NavigationGuardContext.Provider value={registerNavigationGuard}><SafeAreaView style={styles.root}><StatusBar style="dark"/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}><View style={styles.header}><Text style={styles.logo}>maxtravel<Text style={{color:COLORS.action}}>.</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={session&&!unavailableSession?"Open your account":"Open account and sign in"} accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>navigate("Account")} style={[styles.accountButton,busy&&styles.disabled]}><Text style={styles.accountIcon}>{session&&!unavailableSession?session.user.name.slice(0,1).toUpperCase():"◎"}</Text></Pressable></View><ScrollView ref={scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
 {!unavailableSession&&message!==""&&<Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
 {!unavailableSession&&recoveryMessage!==""&&<Text accessibilityRole="alert" style={styles.message}>{recoveryMessage}</Text>}
 {recoveryState.quoteId&&!sessionState.error&&<>
   <Button title="Refresh previous payment status" secondary disabled={busy} onPress={refreshPayment}/>
   {canResumePayment&&<Button title="Resume the existing payment" secondary disabled={busy} onPress={()=>void resumePayment()}/>}
  </>}
 {!recoveryState.hydrated&&!!session&&<Button title="Retry saved payment check" secondary disabled={busy} onPress={()=>void run(async request=>{await paymentGuard.current.hydrate();if(request.isCurrent()){setRecoveryState(paymentGuard.current.snapshot());setRecoveryMessage("");}},"Checking saved payment status…")}/>}
 {busy&&<Text accessibilityLiveRegion="polite" style={styles.status}>{busyLabel}</Text>}
 {tab==="Home"&&<><ImageBackground source={{uri:"https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=900&q=80"}} style={styles.hero} imageStyle={{borderRadius:20}}><View style={styles.heroShade}><Text style={styles.eyebrow}>TIME TO EXPLORE</Text><Text style={styles.heroTitle}>Your next adventure awaits.</Text><Text style={styles.heroText}>Flights, thoughtful stays, and a little more freedom to go.</Text><Button title="Find your next journey →" onPress={()=>navigate("Book")}/></View></ImageBackground><Text style={styles.sectionTitle}>Make room for something new.</Text><View style={styles.card}><Text style={styles.cardTitle}>Flights & hotels, together.</Text><Text style={styles.body}>Explore flights and stays, review the complete fare, and keep your trip updates in one place.</Text><Button title="Explore flights" onPress={()=>{selectProduct("FLIGHT");navigate("Book");}}/><Button title="Find a stay" secondary onPress={()=>{selectProduct("HOTEL");navigate("Book");}}/></View><View style={styles.card}><Text style={styles.cardTitle}>Business trips. A better experience.</Text><Text style={styles.body}>Use your approved company login for contracted pricing and pay per booking.</Text><Button title="Company account" secondary onPress={()=>navigate("Account")}/></View></>}
 {tab==="Book"&&unavailableSession&&<View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>Account access could not be verified. Your booking details are hidden.</Text><Button title="Check account" secondary onPress={()=>navigate("Account")}/></View>}
 {tab==="Book"&&!unavailableSession&&<>{!!session&&paymentAttempted&&<View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{recoveryState.hydrated?"A payment attempt needs confirmation. Booking changes are locked to avoid a second charge. Check My trips or contact support before starting another booking.":"Checking saved payment status before allowing another booking…"}</Text><Button title="Check My trips" secondary onPress={()=>navigate("My trips")}/></View>}<BusyContext.Provider value={busy||paymentAttempted}><Text style={styles.title}>Where to next?</Text><Text style={styles.caption}>In Testing · No live bookings or payments</Text><View style={styles.progress}><Text style={styles.progressText}>{quote?"3 · Travellers & review":results?"2 · Choose your option":"1 · Search your journey"}</Text><Text style={styles.caption}>Search → Choose → Review → Pay → Supplier confirmation</Text></View>{searchSummary!==""&&<Text style={styles.status}>{searchSummary}</Text>}{!quote&&selectionError!==""&&<Text accessibilityRole="alert" style={styles.error}>{selectionError}</Text>}{results&&!quote&&!roomList&&<Button title="Change search" secondary onPress={changeSearch}/>} {!quote&&!results&&<View style={styles.segment}><Button title="Flights" secondary={product!=="FLIGHT"} onPress={()=>selectProduct("FLIGHT")}/><Button title="Hotels" secondary={product!=="HOTEL"} onPress={()=>selectProduct("HOTEL")}/></View>}{!quote&&!results&&<View style={styles.card}>{product==="FLIGHT"&&<Button title={multiCity?"Multi-city selected · Switch to one-way / return":"One-way / return · Switch to multi-city"} secondary onPress={()=>{setMultiCity(!multiCity);setResults(null);setSelectedFares({});}}/>}{product==="FLIGHT"?<><AirportField label="From airport" value={from} onSelect={setFrom}/><AirportField label="To airport" value={to} onSelect={setTo}/></>:<><DestinationPicker draft={destinationDraft} setDraft={setDestinationDraft} onSelect={setHotelIds}/><NationalityPicker value={nationalityLabel} onLabelChange={setNationalityLabel} onSelect={setNationality}/></>}<Field label={product==="FLIGHT"?"Departure date":"Check-in date"} value={date} onChange={setDate} placeholder="YYYY-MM-DD"/>{product==="HOTEL"&&<Field label="Check-out date" value={end} onChange={setEnd} placeholder="YYYY-MM-DD"/>}{product==="FLIGHT"&&!multiCity&&<Field label="Return date, optional" value={returnDate} onChange={setReturnDate} placeholder="YYYY-MM-DD"/>}{product==="FLIGHT"?<><Field label="Children (0–8)" value={children} onChange={setChildren} keyboard="number-pad"/><Field label="Infants under 2" value={infants} onChange={setInfants} keyboard="number-pad"/><Field label="Adults (1–9)" value={adults} onChange={setAdults} keyboard="number-pad"/></>:<>{hotelRooms.map((room,ri)=><View key={ri} style={styles.fare}><Text style={styles.cardTitle}>Room {ri+1}</Text><Field label="Adults (1–4)" value={room.adults} onChange={value=>setHotelRooms(current=>current.map((r,i)=>i===ri?{...r,adults:value}:r))} keyboard="number-pad"/><Field label="Child ages at check-in, comma separated (up to 3)" value={room.ages} onChange={value=>setHotelRooms(current=>current.map((r,i)=>i===ri?{...r,ages:value}:r))} placeholder="e.g. 5,8; leave blank for no children"/></View>)}<Button title="Add room" secondary disabled={hotelRooms.length>=4} onPress={()=>setHotelRooms(current=>[...current,{adults:"2",ages:""}])}/>{hotelRooms.length>1&&<Button title="Remove last room" secondary onPress={()=>setHotelRooms(current=>current.slice(0,-1))}/>}</>}{product==="FLIGHT"&&multiCity&&<View>{extraLegs.map((leg,i)=><View key={i} style={styles.fare}><Text style={styles.cardTitle}>Flight {i+2}</Text><AirportField label="From airport" value={leg.from} onSelect={value=>setExtraLegs(current=>current.map((l,j)=>j===i?{...l,from:value}:l))}/><AirportField label="To airport" value={leg.to} onSelect={value=>setExtraLegs(current=>current.map((l,j)=>j===i?{...l,to:value}:l))}/><Field label="Departure date" value={leg.date} onChange={value=>setExtraLegs(current=>current.map((l,j)=>j===i?{...l,date:value}:l))} placeholder="YYYY-MM-DD"/></View>)}<Button title="Add flight" secondary disabled={extraLegs.length>=5} onPress={()=>setExtraLegs(current=>[...current,{from:"",to:"",date:""}])}/>{extraLegs.length>1&&<Button title="Remove last flight" secondary onPress={()=>setExtraLegs(current=>current.slice(0,-1))}/>}</View>}<Button title={busy?"Searching…":"Search availability"} disabled={busy} onPress={()=>void search()}/>{searchError!==""&&<Text accessibilityRole="alert" style={styles.error}>{searchError}</Text>}</View>}
 {results&&!quote&&product==="FLIGHT"&&Object.values(results.results.searchResult?.tripInfos??{}).flat().length===0&&<View style={styles.card}><Text style={styles.cardTitle}>No flights match this search.</Text><Text style={styles.body}>Try different dates, nearby airports or fewer travellers.</Text></View>}
 {results&&!quote&&product==="HOTEL"&&(results.results.hotels?.length??0)===0&&<View style={styles.card}><Text style={styles.cardTitle}>No stays match this search.</Text><Text style={styles.body}>Try different dates, another destination or fewer guests.</Text></View>}
 {results&&!quote&&product==="FLIGHT"&&Object.entries(results.results.searchResult?.tripInfos||{}).flatMap(([group,flights])=>flights.map(f=>({...f,group}))).map((flight,i)=><View key={i} style={styles.card}><Text style={styles.cardTitle}>{flight.sI?.[0]?.fD?.aI?.name}</Text><Text style={styles.route}>{flight.group==="COMBO"?"Complete itinerary":`${flight.sI?.[0]?.da?.code} → ${flight.sI?.at(-1)?.aa?.code}`}</Text>{flight.group==="COMBO"&&flight.sI.map((segment,j)=><Text key={j} style={styles.body}>{segment.da.code} → {segment.aa.code} · {segment.dt} — {segment.at} · {segment.fD.aI.name}</Text>)}<Text style={styles.body}>{flight.sI?.[0]?.dt} — {flight.sI?.at(-1)?.at}</Text>{flight.totalPriceList.map(fare=><View key={fare.id} style={styles.fare}><Text style={styles.label}>{fare.fareIdentifier}</Text><Text style={styles.price}>{typeof fare.customerEstimateMinor==="number"?amount(fare.customerEstimateMinor):"Price at review"}</Text><Button title={selectedFares[flight.group]===fare.id?"Selected":"Select fare"} disabled={busy} onPress={()=>{if(Object.values(results.results.searchResult?.tripInfos??{}).filter(trips=>trips.length).length>1&&!results.results.searchResult?.tripInfos.COMBO?.length)setSelectedFares(current=>({...current,[flight.group]:fare.id}));else void review({priceIds:[fare.id]});}}/></View>)}</View>)}
 {results&&!quote&&product==="FLIGHT"&&Object.values(results.results.searchResult?.tripInfos??{}).filter(trips=>trips.length).length>1&&!results.results.searchResult?.tripInfos.COMBO?.length&&<Button title="Review selected journey" disabled={busy||Object.entries(results.results.searchResult?.tripInfos??{}).some(([group,trips])=>trips.length&&!selectedFares[group])} onPress={()=>void review({priceIds:Object.entries(results.results.searchResult?.tripInfos??{}).filter(([,trips])=>trips.length).map(([group])=>group).sort((a,b)=>Number(a)-Number(b)).map(group=>selectedFares[group])})}/>}
 {results&&!quote&&!roomList&&product==="HOTEL"&&results.results.hotels?.map(hotel=><View key={hotel.tjHotelId} style={styles.card}><Text style={styles.cardTitle}>{hotel.name}</Text><Button title="Choose a room" disabled={busy} onPress={()=>void chooseHotel(hotel.tjHotelId)}/></View>)}
 {roomList&&!quote&&product==="HOTEL"&&<View style={styles.card}><Text style={styles.cardTitle}>{roomList.rooms.length?"Choose a room":"No rooms are available for these dates."}</Text><Button title="Back to stays" secondary onPress={()=>{setRoomList(null);setSelectionError("");}}/></View>}
 {roomList&&!quote&&product==="HOTEL"&&roomList.rooms.map(room=><View key={room.optionId} style={styles.card}><Text style={styles.cardTitle}>{room.mealBasis||"Room option"}</Text><Text style={styles.price}>{amount(Math.round(room.pricing.totalPrice*100))}</Text><Text style={styles.policy}>{policyDisclosure(room.cancellation)}</Text><Button title="Review room" disabled={busy} onPress={()=>void review({hid:roomList.hid,optionId:room.optionId})}/></View>)}
 {quote&&<View style={styles.card}><Text style={styles.cardTitle}>{product==="FLIGHT"?quote.summary?.legs?quote.summary.legs.map(leg=>`${leg.from} → ${leg.to} (${leg.date})`).join(" · "):`${quote.summary?.from} → ${quote.summary?.to}`:quote.hotelName||"Your stay"}</Text><Text style={styles.body}>{quote.summary?.date||quote.summary?.checkIn} — {quote.summary?.returnDate||quote.summary?.checkOut||"One way"}</Text><Text style={styles.price}>{amount(quote.totalMinor)} total</Text><Text style={styles.body}>{quoteExpired?"Review expired at":"Review expires at"} {new Date(quote.expiresAt).toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata"})} IST</Text><Text style={styles.policy}>{reviewDisclosure(quote.review)}</Text>{product==="FLIGHT"&&<CheckoutExtras key={quote.quoteId} quoteId={quote.quoteId} disabled={busy||paymentAttempted||quoteExpired} onPending={updateExtrasPending} onSaved={total=>{setQuote(current=>current?.quoteId===quote.quoteId?{...current,totalMinor:total}:current);setConsent(false);}}/>}<Button title="Load saved travellers" secondary disabled={busy} onPress={()=>void run(async request=>setSaved((await guardedApi<{travellers:{id:string;name:string;profile:Guest}[]}>(request,"/api/travellers")).travellers),"Loading saved travellers…")}/>{guests.map((guest,i)=><View key={i} style={styles.fare}><Text style={styles.cardTitle}>{guest.roomIndex!==undefined?`Room ${guest.roomIndex+1} · `:""}{guest.pt} {i+1}</Text>{saved.filter(profile=>profile.profile.pt===guest.pt).map(profile=><Button key={profile.id} title={`Use ${profile.name}`} secondary onPress={()=>{const {roomIndex,...person}=profile.profile;void roomIndex;setGuests(current=>current.map((g,j)=>j===i?{...person,...(g.roomIndex!==undefined?{roomIndex:g.roomIndex}:{})}:g));setConsent(false);}}/>)}<View style={styles.segment}>{(["Mr","Ms","Mrs","Master","Miss"] as const).map(title=><Button key={title} title={title} secondary={guest.ti!==title} onPress={()=>updateGuest(i,"ti",title)}/>)}</View><Field label="First name" value={guest.fN} onChange={v=>updateGuest(i,"fN",v)}/><Field label="Last name" value={guest.lN} onChange={v=>updateGuest(i,"lN",v)}/><Field label="Date of birth, if required" value={guest.dob||""} onChange={v=>updateGuest(i,"dob",v)} placeholder="YYYY-MM-DD"/><Field label="Passport, if required" value={guest.pNum||""} onChange={v=>updateGuest(i,"pNum",v)}/><Field label="Passport expiry" value={guest.eD||""} onChange={v=>updateGuest(i,"eD",v)} placeholder="YYYY-MM-DD"/><Field label="Passport nationality (2 letters)" value={guest.pNat||""} onChange={v=>updateGuest(i,"pNat",v.toUpperCase())}/><Field label="PAN, if required" value={guest.pan||""} onChange={v=>updateGuest(i,"pan",v.toUpperCase())}/></View>)}<Field label="Email" value={email} onChange={setEmail} keyboard="email-address"/><Field label="Indian mobile number" value={phone} onChange={setPhone} keyboard="phone-pad"/>{gateway?.provider==="PAYGLOCAL"&&<BillingFields value={billing} addressRequired={product==="FLIGHT"} onChange={v=>{setBilling(v);setConsent(false);}} disabled={busy||paymentAttempted}/>}<Text style={styles.cardTitle}>GST billing, if required</Text><Field label="GSTIN" value={gstNumber} onChange={setGstNumber}/><Field label="Registered company name" value={gstName} onChange={setGstName}/><Field label="Billing address" value={gstAddress} onChange={setGstAddress}/><Text style={styles.cardTitle}>Emergency contact, if required</Text><Field label="Contact name" value={emergencyName} onChange={setEmergencyName}/><Field label="Contact email" value={emergencyEmail} onChange={setEmergencyEmail} keyboard="email-address"/><Field label="Contact phone with country code" value={emergencyPhone} onChange={setEmergencyPhone}/><Pressable disabled={busy||quoteExpired||paymentAttempted} accessibilityRole="checkbox" accessibilityState={{checked:consent,disabled:busy||quoteExpired||paymentAttempted}} onPress={()=>setConsent(!consent)} style={styles.consent}><Text style={styles.body}>{consent?"☑":"☐"} I accept the reviewed total and supplier rules for this test booking.</Text></Pressable><Text style={styles.caption}>Payment is separate from booking confirmation. Your trip is confirmed only after the supplier confirms it.</Text>{quoteExpired&&<Text accessibilityRole="alert" style={styles.message}>This review has expired. Change selection to check a fresh price before payment.</Text>}{paymentAttempted&&<Button title="Check payment and booking status" secondary onPress={()=>navigate("My trips")}/>}{gatewayError!==""&&<><Text accessibilityRole="alert" style={styles.error}>{gatewayError}</Text><Button title="Retry payment status" secondary disabled={busy} onPress={()=>setGatewayRetry(value=>value+1)}/></>}{payError!==""&&<Text accessibilityRole="alert" style={styles.error}>{payError}</Text>}<Button title={busy?"Payment in progress…":gatewayLoading?"Checking payment status…":!gateway?.configured?"Online payment unavailable":"Open secure checkout"} disabled={!gateway?.configured||gatewayLoading||busy||quoteExpired||paymentAttempted} onPress={()=>void pay()}/><Button title="Change selection" secondary disabled={busy||paymentAttempted} onPress={()=>{if(extrasPending&&!quoteExpired){setPayError("Apply or discard your unapplied flight extras before changing selection.");return;}setQuote(null);setConsent(false);setPayError("");}}/></View>}</BusyContext.Provider></>}
 {tab==="My trips"&&<><Text style={styles.title}>Every journey, together.</Text>{unavailableSession?<View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>Account access could not be verified. Your trips are hidden.</Text><Button title="Check account access" secondary onPress={()=>void refetch()}/></View>:!session?<Button title="Sign in to view trips" onPress={()=>navigate("Account")}/>:tripsLoading&&trips.length===0?<View style={styles.card}><ActivityIndicator/><Text style={styles.body}>Loading your latest trips…</Text></View>:tripsError&&trips.length===0?<View style={styles.card}><Text style={styles.cardTitle}>Trips could not be loaded.</Text><Text accessibilityRole="alert" style={styles.body}>{tripsError}</Text><Button title="Retry trip history" secondary onPress={()=>setTripsRefresh(current=>current+1)}/></View>:trips.length===0?<View style={styles.card}><Text style={styles.cardTitle}>Your next story starts here.</Text><Text style={styles.body}>No bookings are linked to your account yet.</Text><Button title="Find your next trip" onPress={()=>navigate("Book")}/></View>:trips.map(trip=><View key={trip.id} style={styles.card}><Text style={styles.caption}>{trip.product}</Text><Text style={styles.cardTitle}>{trip.reference}</Text>{trip.service_kind&&<Text style={styles.caption}>{trip.service_kind} · Original booking {trip.parent_order_id}</Text>}<Text style={styles.status}>{trip.status.replaceAll("_"," ")}</Text><Text style={styles.price}>{amount(Number(trip.total_minor))}</Text>{trip.linked_services?.map(service=><Text key={service.reference} style={styles.caption}>{service.kind} · {service.reference} · {service.status}{service.kind==="REISSUE"&&service.status==="TICKETED"?" · Use the replacement ticket for changed travel.":""}</Text>)}{trip.refunds?.map(refund=><Text key={refund.id} style={styles.status}>Refund {amount(Number(refund.amountMinor))} · {refund.status}</Text>)}{["TICKETED","CONFIRMED"].includes(trip.status)&&<Button title="View confirmation" secondary onPress={()=>void run(async request=>{const data=await guardedApi<{supplierBookingId:string;passengers:{name:string;pnrs:string[];tickets:string[]}[]}>(request,`/api/bookings/${trip.id}/details`);setMessage([data.supplierBookingId,...data.passengers.map(p=>`${p.name}: PNR ${p.pnrs.join(", ")||"awaiting supplier"}; tickets ${p.tickets.join(", ")||"awaiting supplier"}`)].filter(Boolean).join(" · ")||"Confirmation is awaiting supplier details.");scrollView.current?.scrollTo({y:0,animated:true});})}/>}<CancellationTools trip={trip}/>{trip.product==="FLIGHT"&&trip.status==="TICKETED"&&trip.service_kind!=="ANCILLARY"&&<NativeFlightServices bookingId={trip.id}/>}</View>)}</>}
 {tab==="My trips"&&!!session&&!unavailableSession&&trips.length>0&&<>
  {tripsError&&<Text accessibilityRole="alert" style={styles.error}>Latest trip updates could not be loaded. {tripsError}</Text>}
  <Button title="Refresh trip status" secondary disabled={tripsLoading} onPress={()=>setTripsRefresh(current=>current+1)}/>
 </>}
 {tab==="My trips"&&!!session&&!unavailableSession&&moreTrips&&<Button title={tripsLoading?"Loading older trips…":"Load older trips"} secondary disabled={busy||tripsLoading} onPress={()=>setTripPage(page=>page+1)}/>}
 {tab==="Account"&&<><Text style={styles.title}>{session&&!unavailableSession?`Hello, ${session.user.name}`:"Your journey starts here."}</Text>{isPending?<ActivityIndicator/>:unavailableSession?<View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>We couldn’t verify your account access. Try again before opening private account details.</Text><Button title="Check account access" secondary disabled={sessionState.isRefetching} onPress={()=>void refetch()}/></View>:session?<View style={styles.card}><Text style={styles.body}>{session.user.email}</Text><Text style={styles.body}>Your corporate access and pricing follow your approved company account. Review payer billing details at checkout.</Text><Button title="My trips" onPress={()=>navigate("My trips")}/><Button title="Account security and saved travellers" secondary onPress={()=>void Linking.openURL(API_URL+"/account")}/><NativeAccountTools twoFactorEnabled={Boolean(session.user.twoFactorEnabled)} onSecurityChange={refetch}/><Button title="Sign out" secondary onPress={()=>void run(async()=>{const result=await authClient.signOut();if(result.error)throw Error(result.error.message);await refetch();},"Signing out…",true)}/></View>:<View style={styles.card}><View style={styles.segment}>{(["signin","signup","reset"] as const).map(mode=><Button key={mode} title={mode==="signin"?"Sign in":mode==="signup"?"Register":"Reset"} secondary={authMode!==mode} onPress={()=>{setAuthMode(mode);setAuthError("");setPassword("");setCode("");setRecovery(false);}}/>)}</View>{authMode==="challenge"?<><Field label={recovery?"One-time recovery code":"Authenticator code"} value={code} onChange={setCode} keyboard={recovery?"default":"number-pad"}/><Button title={recovery?"Use authenticator":"Use recovery code"} secondary onPress={()=>{setRecovery(!recovery);setCode("");}}/></>:<>{authMode==="signup"&&<Field label="Your name" value={name} onChange={setName}/>}<Field label="Email" value={email} onChange={setEmail} keyboard="email-address"/>{authMode!=="reset"&&<Field label="Password" value={password} onChange={setPassword} secure/>}</>}<Button title={busy?"Please wait…":authMode==="challenge"?"Verify code":authMode==="signup"?"Create account":authMode==="reset"?"Send reset link":"Sign in"} disabled={busy} onPress={()=>void run(async()=>{if(authMode==="challenge"){const result=recovery?await authClient.twoFactor.verifyBackupCode({code}):await authClient.twoFactor.verifyTotp({code});if(result.error)throw Error(result.error.message);await refetch();setPassword("");}else if(authMode==="signup"){const result=await authClient.signUp.email({email:email.trim(),password,name:name.trim()});if(result.error)throw Error(result.error.message);setMessage("Request accepted; account creation and email delivery are not confirmed here. If a verification link arrives, follow it before signing in. If no link arrives, request verification from the web account page or contact support.");setAuthMode("signin");setPassword("");}else if(authMode==="reset"){const result=await authClient.requestPasswordReset({email:email.trim(),redirectTo:API_URL+"/reset-password"});if(result.error)throw Error(result.error.message);setMessage("Request accepted. If the account exists, we’ll attempt to send a reset link. Delivery is not confirmed. Check inbox and spam; if no link arrives, wait a minute and retry or contact support.");}else{const result=await authClient.signIn.email({email:email.trim(),password});if(result.error)throw Error(result.error.message);setPassword("");if(result.data&&"twoFactorRedirect" in result.data&&result.data.twoFactorRedirect)setAuthMode("challenge");else await refetch();}},"Checking account…",true,setAuthError)}/>{authError!==""&&<Text accessibilityRole="alert" style={styles.error}>{authError}</Text>}<Text style={styles.caption}>Verified email required. Company accounts are approved by Max Travel.</Text></View>}</>}
 <Text style={styles.disclaimer}>In Testing · No live bookings or payments</Text></ScrollView>{busy&&<ActivityIndicator style={styles.loader} color={COLORS.action}/>}{navigationMessage!==""&&<Text accessibilityRole="alert" style={styles.navigationMessage}>{navigationMessage}</Text>}<View accessibilityRole="tablist" style={styles.bottomNav}>{(["Home","Book","My trips","Account"] as Tab[]).map(item=><Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{selected:tab===item,disabled:busy}} disabled={busy} onPress={()=>navigate(item)} style={styles.navItem}><Text accessible={false} importantForAccessibility="no" style={[styles.navIcon,tab===item&&{color:COLORS.action}]}>{item==="Home"?"⌂":item==="Book"?"✈":item==="My trips"?"▣":"◎"}</Text><Text style={[styles.navLabel,tab===item&&{color:COLORS.action,fontWeight:"700"}]}>{item}</Text></Pressable>)}</View></KeyboardAvoidingView></SafeAreaView></NavigationGuardContext.Provider></BusyContext.Provider></PaymentSafetyContext.Provider>;
}
function AccountSession(){const sessionState=authClient.useSession();return <NativeApp key={sessionState.data?.user.id??"signed-out"} sessionState={sessionState}/>;}
export default function App(){return <SafeAreaProvider><InputFocusProvider><AccountSession/></InputFocusProvider></SafeAreaProvider>;}
const styles=StyleSheet.create({
 disabled:{opacity:.55},
 error:{color:COLORS.error,fontSize:14,lineHeight:21,marginVertical:8},
 success:{color:COLORS.success,fontSize:14,lineHeight:21,marginVertical:8},
 checkbox:{minHeight:44,justifyContent:"center"},
 accountButton:{minWidth:48,minHeight:48,alignItems:"center",justifyContent:"center"},
 navigationMessage:{color:COLORS.ink,backgroundColor:"#e8f1ff",paddingHorizontal:18,paddingVertical:10,fontSize:14,lineHeight:21},
 progress:{backgroundColor:"#eaf1ff",padding:14,borderRadius:12,marginBottom:16},progressText:{fontSize:14,fontWeight:"700",color:COLORS.action,marginBottom:6},root:{flex:1,backgroundColor:COLORS.page},header:{paddingHorizontal:23,paddingVertical:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},logo:{fontSize:27,fontWeight:"800",fontStyle:"italic",color:COLORS.action},accountIcon:{width:36,height:36,borderRadius:18,backgroundColor:"#e8f1ff",textAlign:"center",paddingTop:7,fontSize:18,color:COLORS.action},content:{padding:18,paddingTop:0,paddingBottom:32},hero:{height:300,marginBottom:24},heroShade:{flex:1,borderRadius:24,backgroundColor:"#001736ad",padding:23,justifyContent:"center"},eyebrow:{color:"#fff",fontSize:9,letterSpacing:1.5,marginBottom:15},heroTitle:{fontSize:34,lineHeight:39,fontWeight:"700",color:"#fff",letterSpacing:-1},heroText:{fontSize:13,lineHeight:21,color:"#e9f3ff",marginVertical:14},title:{fontSize:30,lineHeight:36,fontWeight:"700",color:COLORS.ink,marginBottom:13},sectionTitle:{fontSize:25,lineHeight:32,fontWeight:"700",color:COLORS.ink,marginBottom:17},caption:{fontSize:12,lineHeight:19,color:COLORS.muted,marginBottom:12},card:{backgroundColor:"#fff",borderRadius:20,borderWidth:1,borderColor:COLORS.line,padding:20,marginBottom:18},cardTitle:{fontSize:20,lineHeight:27,fontWeight:"600",color:COLORS.ink,marginBottom:10},body:{fontSize:14,lineHeight:22,color:COLORS.muted,marginBottom:12},button:{backgroundColor:COLORS.action,borderRadius:12,minHeight:47,paddingHorizontal:17,paddingVertical:14,alignItems:"center",justifyContent:"center",marginTop:10},buttonText:{color:"#fff",fontSize:14,fontWeight:"600"},secondary:{backgroundColor:"#eff4fd",borderWidth:1,borderColor:"#dbe6f7"},field:{marginBottom:15},label:{fontSize:12,fontWeight:"500",color:"#435d76",marginBottom:8},input:{fontSize:16,color:COLORS.ink,backgroundColor:"#f7f9fc",padding:13,minHeight:48,borderRadius:10,borderWidth:1,borderColor:"#a6b4c4"},segment:{flexDirection:"row",gap:8,marginBottom:15,flexWrap:"wrap"},fare:{borderTopWidth:1,borderTopColor:"#e4ebf5",paddingTop:18,marginTop:16},price:{fontSize:25,fontWeight:"700",color:COLORS.ink,marginBottom:10},route:{fontSize:26,fontWeight:"700",color:COLORS.ink,marginBottom:13},status:{color:"#175b9c",fontSize:12,fontWeight:"600",backgroundColor:"#edf4ff",padding:9,borderRadius:6,marginBottom:14},policy:{fontSize:12,lineHeight:19,color:"#526981",backgroundColor:"#f4f7fc",padding:12,borderRadius:8,marginBottom:15},consent:{marginVertical:10,minHeight:44,justifyContent:"center"},message:{backgroundColor:"#e8f1ff",padding:15,borderRadius:10,fontSize:13,lineHeight:20,color:"#274f7a",marginBottom:20},bottomNav:{flexDirection:"row",backgroundColor:"#fff",paddingTop:12,paddingBottom:13,borderTopWidth:1,borderTopColor:"#e4ebf4"},navItem:{flex:1,alignItems:"center",gap:4,minHeight:52,justifyContent:"center"},navIcon:{fontSize:21,color:COLORS.muted},navLabel:{fontSize:12,color:COLORS.muted},loader:{position:"absolute",top:80,right:25},disclaimer:{fontSize:12,color:COLORS.muted,textAlign:"center",marginTop:12}});

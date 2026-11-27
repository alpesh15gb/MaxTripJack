/** Opaque identifiers only. Never store guest/contact data or gateway credentials. */
export const CHECKOUT_RECOVERY_KEY='maxtravel.pending-checkout.v1';
export type CheckoutMarker={quoteId:string;bookingId?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseCheckoutMarker(value:string|null):CheckoutMarker|null{
  if(!value)return null;
  try{const data=JSON.parse(value);if(!data||typeof data.quoteId!=='string'||!uuid.test(data.quoteId))return null;return {quoteId:data.quoteId,...(typeof data.bookingId==='string'&&uuid.test(data.bookingId)?{bookingId:data.bookingId}:{})};}catch{return null;}
}
const markerLimit=20;
function validStoredMarker(value:unknown):CheckoutMarker{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Checkout recovery storage is invalid.');
  const row=value as Record<string,unknown>;
  if(typeof row.quoteId!=='string'||!uuid.test(row.quoteId)||
    (row.bookingId!==undefined&&(typeof row.bookingId!=='string'||!uuid.test(row.bookingId))))throw Error('Checkout recovery storage is invalid.');
  return {quoteId:row.quoteId,...(typeof row.bookingId==='string'?{bookingId:row.bookingId}:{})};
}
/** Read failures are deliberately observable: unreadable recovery is not an empty history. */
export function readCheckoutMarkers():CheckoutMarker[]{
  const stored=sessionStorage.getItem(CHECKOUT_RECOVERY_KEY);
  if(stored===null)return [];
  const value:unknown=JSON.parse(stored);
  const rows=Array.isArray(value)?value:[value];
  if(rows.length>markerLimit)throw Error('Checkout recovery storage is full.');
  const markers=rows.map(validStoredMarker);
  if(new Set(markers.map(marker=>marker.quoteId)).size!==markers.length)throw Error('Checkout recovery storage has duplicate quote references.');
  return markers;
}
function writeCheckoutMarkers(markers:CheckoutMarker[]){
  if(!markers.length)sessionStorage.removeItem(CHECKOUT_RECOVERY_KEY);
  else sessionStorage.setItem(CHECKOUT_RECOVERY_KEY,JSON.stringify(markers.length===1?markers[0]:markers));
}
export function saveCheckoutMarker(marker:CheckoutMarker){
  try{
    const safe=validStoredMarker(marker),markers=readCheckoutMarkers();
    const index=markers.findIndex(existing=>existing.quoteId===safe.quoteId);
    if(index>=0){
      const existing=markers[index];
      if(existing.bookingId&&safe.bookingId&&existing.bookingId!==safe.bookingId)return false;
      markers[index]={...existing,...safe};
    }else{
      if(markers.length>=markerLimit)return false;
      markers.push(safe);
    }
    writeCheckoutMarkers(markers);return true;
  }catch{return false;}
}
export function clearCheckoutMarker(expected?:Partial<CheckoutMarker>, onlyWithoutBooking=false){
  if(!expected||(!expected.quoteId&&!expected.bookingId)||
    (expected.quoteId!==undefined&&(typeof expected.quoteId!=='string'||!uuid.test(expected.quoteId)))||
    (expected.bookingId!==undefined&&(typeof expected.bookingId!=='string'||!uuid.test(expected.bookingId))))return false;
  try{
    const markers=readCheckoutMarkers();
    // Status for a quote without a booking must never clear a marker that
    // gained a booking while the status request was in flight.
    if(onlyWithoutBooking&&(!expected.quoteId||markers.some(marker=>marker.quoteId===expected.quoteId&&marker.bookingId)))return false;
    const remaining=markers.filter(marker=>!((!expected.quoteId||marker.quoteId===expected.quoteId)&&(!expected.bookingId||marker.bookingId===expected.bookingId)));
    if(remaining.length!==markers.length)writeCheckoutMarkers(remaining);
    return true;
  }catch{return false;}
}
export type CheckoutRecoveryStatus={found?:boolean;quoteId?:string;provider?:string;checkoutUrl?:string;bookingId?:string;status?:string;paymentStatus?:string;intentState?:string;canResume:boolean;checkoutResolved?:boolean;quoteExpiresAt?:string;message?:string;orderId?:string;keyId?:string;amount?:number;currency?:string};
export function isResumableCheckout(value:CheckoutRecoveryStatus):value is CheckoutRecoveryStatus&{bookingId:string;orderId:string;keyId:string;amount:number;currency:string}{
  return (value.provider===undefined||value.provider==='RAZORPAY')&&value.canResume===true&&typeof value.bookingId==='string'&&uuid.test(value.bookingId)&&typeof value.orderId==='string'&&Boolean(value.orderId)&&typeof value.keyId==='string'&&Boolean(value.keyId)&&typeof value.amount==='number'&&Number.isSafeInteger(value.amount)&&value.amount>0&&value.currency==='INR';
}
export function parseCheckoutRecoveryStatus(value:unknown):CheckoutRecoveryStatus|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  if(typeof row.canResume!=='boolean'||typeof row.status!=='string')return null;
  if(row.status==='EXPIRED_WITHOUT_PAYMENT'&&(row.bookingId!==undefined||row.found!==false||typeof row.quoteId!=='string'||!uuid.test(row.quoteId)))return null;
  const result:CheckoutRecoveryStatus={canResume:row.canResume,status:row.status};
  for(const key of ['quoteId','provider','checkoutUrl','bookingId','paymentStatus','intentState','quoteExpiresAt','message','orderId','keyId','currency'] as const)if(typeof row[key]==='string')result[key]=row[key];
  if(typeof row.amount==='number')result.amount=row.amount;
  if(typeof row.found==='boolean')result.found=row.found;
  if(typeof row.checkoutResolved==='boolean')result.checkoutResolved=row.checkoutResolved;
  return result;
}
export function isResolvedCheckout(value:CheckoutRecoveryStatus){
  return value.checkoutResolved===true&&value.canResume===false&&typeof value.bookingId==='string'&&uuid.test(value.bookingId)&&(
    value.paymentStatus==='CAPTURED'||['PAID','BOOKING_PENDING','TICKETED','CONFIRMED','BOOKING_FAILED','CANCELLED','CLOSED'].includes(value.status??'')
  );
}
export function isExpiredCheckoutWithoutPayment(value:CheckoutRecoveryStatus, expected:CheckoutMarker){
  return value.status==='EXPIRED_WITHOUT_PAYMENT'&&value.found===false&&value.canResume===false&&value.checkoutResolved===true&&
    value.bookingId===undefined&&expected.bookingId===undefined&&value.quoteId===expected.quoteId&&uuid.test(expected.quoteId);
}

/** Only server-issued UAT checkout destinations; never trust callback query fields. */
export function isResumableHostedCheckout(value:CheckoutRecoveryStatus):value is CheckoutRecoveryStatus&{provider:'PAYGLOCAL';bookingId:string;checkoutUrl:string;amount:number;currency:'INR'}{
  if(value.provider!=='PAYGLOCAL'||value.canResume!==true||typeof value.bookingId!=='string'||!uuid.test(value.bookingId)||typeof value.amount!=='number'||!Number.isSafeInteger(value.amount)||value.amount<=0||value.currency!=='INR'||typeof value.checkoutUrl!=='string')return false;
  try{if(/[\s\\]/.test(value.checkoutUrl))return false;const url=new URL(value.checkoutUrl);return url.origin==='https://api.uat.payglocal.in'&&url.pathname==='/gl/payflow-ui/'&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}

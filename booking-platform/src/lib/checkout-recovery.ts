/** Opaque identifiers only. Never store guest/contact data or gateway credentials. */
export const CHECKOUT_RECOVERY_KEY='maxtravel.pending-checkout.v1';
export type CheckoutMarker={quoteId:string;bookingId?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseCheckoutMarker(value:string|null):CheckoutMarker|null{
  if(!value)return null;
  try{const data=JSON.parse(value);if(!data||typeof data.quoteId!=='string'||!uuid.test(data.quoteId))return null;return {quoteId:data.quoteId,...(typeof data.bookingId==='string'&&uuid.test(data.bookingId)?{bookingId:data.bookingId}:{})};}catch{return null;}
}
export function saveCheckoutMarker(marker:CheckoutMarker){
  try{const safe=parseCheckoutMarker(JSON.stringify(marker));if(!safe)return false;const existing=parseCheckoutMarker(sessionStorage.getItem(CHECKOUT_RECOVERY_KEY));if(existing&&existing.quoteId!==safe.quoteId)return false;sessionStorage.setItem(CHECKOUT_RECOVERY_KEY,JSON.stringify(safe));return true;}catch{return false;}
}
export function clearCheckoutMarker(expected?:Partial<CheckoutMarker>){try{const existing=parseCheckoutMarker(sessionStorage.getItem(CHECKOUT_RECOVERY_KEY));if(expected&&existing&&((expected.quoteId&&existing.quoteId!==expected.quoteId)||(expected.bookingId&&existing.bookingId!==expected.bookingId)))return;sessionStorage.removeItem(CHECKOUT_RECOVERY_KEY);}catch{/* The in-memory guard remains active if browser storage is unavailable. */}}
export type CheckoutRecoveryStatus={bookingId?:string;status?:string;paymentStatus?:string;intentState?:string;canResume:boolean;checkoutResolved?:boolean;quoteExpiresAt?:string;message?:string;orderId?:string;keyId?:string;amount?:number;currency?:string};
export function isResumableCheckout(value:CheckoutRecoveryStatus):value is CheckoutRecoveryStatus&{bookingId:string;orderId:string;keyId:string;amount:number;currency:string}{
  return value.canResume===true&&typeof value.bookingId==='string'&&uuid.test(value.bookingId)&&typeof value.orderId==='string'&&Boolean(value.orderId)&&typeof value.keyId==='string'&&Boolean(value.keyId)&&typeof value.amount==='number'&&Number.isSafeInteger(value.amount)&&value.amount>0&&value.currency==='INR';
}
export function parseCheckoutRecoveryStatus(value:unknown):CheckoutRecoveryStatus|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  if(typeof row.canResume!=='boolean'||typeof row.status!=='string')return null;
  const result:CheckoutRecoveryStatus={canResume:row.canResume,status:row.status};
  for(const key of ['bookingId','paymentStatus','intentState','quoteExpiresAt','message','orderId','keyId','currency'] as const)if(typeof row[key]==='string')result[key]=row[key];
  if(typeof row.amount==='number')result.amount=row.amount;
  if(typeof row.checkoutResolved==='boolean')result.checkoutResolved=row.checkoutResolved;
  return result;
}
export function isResolvedCheckout(value:CheckoutRecoveryStatus){
  return value.checkoutResolved===true&&value.canResume===false&&typeof value.bookingId==='string'&&uuid.test(value.bookingId)&&(
    value.paymentStatus==='CAPTURED'||['PAID','BOOKING_PENDING','TICKETED','CONFIRMED','BOOKING_FAILED','CANCELLED','CLOSED'].includes(value.status??'')
  );
}

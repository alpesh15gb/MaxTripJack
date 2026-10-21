import 'server-only';
import {selectedPaymentProvider,assertNewPaymentProviderReady} from './payment-provider';
import {razorpayKey} from './providers/razorpay';
/** Configuration readiness only, not a promise of provider uptime or booking success.
 * Reuses real backend gates. Never returns credentials or diagnostic internals. */
export function newCheckoutConfigured():boolean {
 try{
  const provider=selectedPaymentProvider();
  assertNewPaymentProviderReady(provider);
  if(provider==='RAZORPAY')razorpayKey();
  return true;
 }catch{return false;}
}

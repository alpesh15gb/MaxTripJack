import {json} from '@/lib/http';
import {newCheckoutConfigured} from '@/lib/checkout-availability';
import {selectedPaymentProvider} from '@/lib/payment-provider';
export function GET(){let provider:null|string=null;try{provider=selectedPaymentProvider();}catch{}return json({provider,configured:newCheckoutConfigured()});}

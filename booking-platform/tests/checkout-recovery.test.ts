import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCheckoutMarker,isResumableCheckout,isResumableHostedCheckout,parseCheckoutRecoveryStatus,isResolvedCheckout} from '../src/lib/checkout-recovery';
const id='11111111-1111-4111-8111-111111111111';
test('interruption marker keeps only opaque IDs and discards all guest/payment payloads',()=>{assert.deepEqual(parseCheckoutMarker(JSON.stringify({quoteId:id,bookingId:id,guests:{name:'Private'},email:'private@example.com',keyId:'key',orderId:'gateway'})),{quoteId:id,bookingId:id});assert.equal(parseCheckoutMarker('{'),null);assert.equal(parseCheckoutMarker(JSON.stringify({quoteId:'invalid'})),null);});
test('recovery can never open a partial or non-INR payment contract',()=>{assert.equal(isResumableCheckout({canResume:true}),false);assert.equal(isResumableCheckout({canResume:false,bookingId:id,orderId:'order',keyId:'key',amount:100,currency:'INR'}),false);assert.equal(isResumableCheckout({canResume:true,bookingId:id,orderId:'order',keyId:'key',amount:100,currency:'USD'}),false);assert.equal(isResumableCheckout({canResume:true,bookingId:id,orderId:'order',keyId:'key',amount:100,currency:'INR'}),true);});

test('malformed and inconclusive payment statuses never resolve an interrupted attempt',()=>{assert.equal(parseCheckoutRecoveryStatus(null),null);assert.equal(parseCheckoutRecoveryStatus({checkoutResolved:true}),null);assert.equal(parseCheckoutRecoveryStatus({canResume:'true',status:'PAID'}),null);assert.equal(isResolvedCheckout({canResume:false,checkoutResolved:true,status:'OUTCOME_UNCONFIRMED'}),false);assert.equal(isResolvedCheckout({canResume:false,checkoutResolved:true,status:'PAID',bookingId:id}),true);assert.deepEqual(parseCheckoutRecoveryStatus({canResume:false,status:'OUTCOME_UNCONFIRMED',message:{unsafe:'object'}}),{canResume:false,status:'OUTCOME_UNCONFIRMED'});});

const hosted={provider:'PAYGLOCAL',canResume:true,bookingId:id,amount:100,currency:'INR',checkoutUrl:'https://api.uat.payglocal.in/gl/payflow-ui/?x-gl-token=mock'};
test('PayGlocal hosted checkout is discriminated from historical Razorpay',()=>{
 assert.equal(isResumableHostedCheckout(hosted),true);
 assert.equal(isResumableCheckout({...hosted,orderId:'order',keyId:'key'}),false);
 assert.equal(isResumableHostedCheckout({...hosted,provider:'UNKNOWN'}),false);
 const parsed=parseCheckoutRecoveryStatus({...hosted,status:'PAYMENT_PENDING'});
 assert.ok(parsed);assert.equal(isResumableHostedCheckout(parsed),true);
});
test('hosted checkout rejects unsafe and unverified destinations',()=>{
 for(const checkoutUrl of ['javascript:alert(1)','http://api.uat.payglocal.in/gl/payflow-ui/','https://api.uat.payglocal.in.evil.test/gl/payflow-ui/','https://evil.test/','https://user@api.uat.payglocal.in/gl/payflow-ui/','https://api.uat.payglocal.in/gl/payflow-ui/#fake','https://api.uat.payglocal.in/redirect','https://api.payglocal.in/gl/payflow-ui/',' https://api.uat.payglocal.in/gl/payflow-ui/'])assert.equal(isResumableHostedCheckout({...hosted,checkoutUrl}),false,checkoutUrl);
});
test('hosted return alone is not payment proof and invalid amounts cannot reopen',()=>{
 assert.equal(isResolvedCheckout({...hosted,status:'SENT_FOR_CAPTURE',checkoutResolved:true}),false);
 for(const override of [{canResume:false},{amount:0},{amount:1.5},{currency:'USD'},{bookingId:'forged'}])assert.equal(isResumableHostedCheckout({...hosted,...override}),false);
});

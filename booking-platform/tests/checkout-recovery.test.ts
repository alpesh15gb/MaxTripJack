import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKOUT_RECOVERY_KEY,parseCheckoutMarker,readCheckoutMarkers,saveCheckoutMarker,clearCheckoutMarker,isResumableCheckout,isResumableHostedCheckout,parseCheckoutRecoveryStatus,isResolvedCheckout} from '../src/lib/checkout-recovery';
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

const otherId='22222222-2222-4222-8222-222222222222';
const bookingId='33333333-3333-4333-8333-333333333333';
function withStorage(run:(store:{value:string|null;failRead:boolean;failWrite:boolean})=>void){
 const prior=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 const store={value:null as string|null,failRead:false,failWrite:false};
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
  getItem(key:string){assert.equal(key,CHECKOUT_RECOVERY_KEY);if(store.failRead)throw Error('Storage read denied');return store.value;},
  setItem(key:string,value:string){assert.equal(key,CHECKOUT_RECOVERY_KEY);if(store.failWrite)throw Error('Storage write denied');store.value=value;},
  removeItem(key:string){assert.equal(key,CHECKOUT_RECOVERY_KEY);if(store.failWrite)throw Error('Storage write denied');store.value=null;},
 }});
 try{run(store);}finally{if(prior)Object.defineProperty(globalThis,'sessionStorage',prior);else Reflect.deleteProperty(globalThis,'sessionStorage');}
}

test('legacy marker survives another checkout and collection round-trips back to a singleton',()=>withStorage(store=>{
 store.value=JSON.stringify({quoteId:id,bookingId,guests:{name:'Private'}});
 assert.deepEqual(readCheckoutMarkers(),[{quoteId:id,bookingId}]);
 assert.equal(saveCheckoutMarker({quoteId:otherId}),true);
 assert.deepEqual(JSON.parse(store.value!),[{quoteId:id,bookingId},{quoteId:otherId}]);
 assert.deepEqual(readCheckoutMarkers(),[{quoteId:id,bookingId},{quoteId:otherId}]);
 clearCheckoutMarker({quoteId:otherId});
 assert.deepEqual(JSON.parse(store.value!),{quoteId:id,bookingId});
 assert.deepEqual(parseCheckoutMarker(store.value),{quoteId:id,bookingId});
 clearCheckoutMarker({bookingId});assert.equal(store.value,null);
 assert.deepEqual(readCheckoutMarkers(),[]);
}));

test('marker updates retain original booking identity and reject conflicting rebinding',()=>withStorage(store=>{
 assert.equal(saveCheckoutMarker({quoteId:id}),true);
 assert.equal(saveCheckoutMarker({quoteId:otherId}),true);
 assert.equal(saveCheckoutMarker({quoteId:id,bookingId}),true);
 assert.equal(saveCheckoutMarker({quoteId:id}),true);
 const saved=store.value;
 assert.equal(saveCheckoutMarker({quoteId:id,bookingId:otherId}),false);
 assert.equal(store.value,saved);
 assert.deepEqual(readCheckoutMarkers(),[{quoteId:id,bookingId},{quoteId:otherId}]);
}));

test('exact deletion fails closed for empty, invalid or mismatched expectations',()=>withStorage(store=>{
 saveCheckoutMarker({quoteId:id,bookingId});saveCheckoutMarker({quoteId:otherId,bookingId:otherId});
 const saved=store.value;
 for(const expected of [undefined,{}, {quoteId:''},{quoteId:'invalid'},{quoteId:id,bookingId:otherId},{bookingId:id}]){
  clearCheckoutMarker(expected);assert.equal(store.value,saved);
 }
 clearCheckoutMarker({quoteId:id,bookingId});
 assert.deepEqual(readCheckoutMarkers(),[{quoteId:otherId,bookingId:otherId}]);
 clearCheckoutMarker({bookingId:otherId});assert.equal(store.value,null);
}));

test('unreadable and malformed storage never becomes an empty checkout history or gets overwritten',()=>withStorage(store=>{
 store.value=JSON.stringify({quoteId:id});store.failRead=true;
 assert.throws(()=>readCheckoutMarkers(),/Storage read denied/);
 assert.equal(saveCheckoutMarker({quoteId:otherId}),false);
 clearCheckoutMarker({quoteId:id});assert.equal(store.value,JSON.stringify({quoteId:id}));
 store.failRead=false;
 for(const raw of ['{','null','{}','',JSON.stringify([{quoteId:id},{quoteId:'bad'}]),JSON.stringify([{quoteId:id},{quoteId:id,bookingId}]),JSON.stringify({quoteId:id,bookingId:'bad'})]){
  store.value=raw;assert.throws(()=>readCheckoutMarkers());
  assert.equal(saveCheckoutMarker({quoteId:otherId}),false);clearCheckoutMarker({quoteId:id});assert.equal(store.value,raw);
 }
}));

test('write failures and invalid markers preserve the complete existing collection',()=>withStorage(store=>{
 saveCheckoutMarker({quoteId:id,bookingId});const saved=store.value;store.failWrite=true;
 assert.equal(saveCheckoutMarker({quoteId:otherId}),false);assert.equal(store.value,saved);
 clearCheckoutMarker({quoteId:id});assert.equal(store.value,saved);
 store.failWrite=false;
 assert.equal(saveCheckoutMarker({quoteId:'bad'}),false);
 assert.equal(saveCheckoutMarker({quoteId:otherId,bookingId:'bad'}),false);
 assert.equal(store.value,saved);
}));

test('twenty unresolved markers remain intact at capacity while exact updates and deletions work',()=>withStorage(store=>{
 const ids=Array.from({length:21},(_,index)=>`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`);
 for(const quoteId of ids.slice(0,20))assert.equal(saveCheckoutMarker({quoteId}),true);
 const saved=store.value;assert.equal(saveCheckoutMarker({quoteId:ids[20]}),false);assert.equal(store.value,saved);
 assert.equal(saveCheckoutMarker({quoteId:ids[0],bookingId}),true);
 assert.equal(readCheckoutMarkers().length,20);
 clearCheckoutMarker({quoteId:ids[5]});assert.equal(saveCheckoutMarker({quoteId:ids[20]}),true);
 assert.deepEqual(readCheckoutMarkers().map(marker=>marker.quoteId),ids.filter((_,index)=>index!==5));
 store.value=JSON.stringify(ids.map(quoteId=>({quoteId})));
 assert.throws(()=>readCheckoutMarkers(),/full/);
 assert.equal(saveCheckoutMarker({quoteId:ids[0]}),false);
 assert.equal(JSON.parse(store.value!).length,21);
}));

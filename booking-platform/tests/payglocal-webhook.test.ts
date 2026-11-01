import test from 'node:test';
import assert from 'node:assert/strict';
import {payGlocalWebhookHint} from '../src/lib/payglocal-webhook';
const event={merchantId:'testmerchant',merchantTxnId:'fixture123456789',gid:'gl_original',amount:'100.01',currency:'INR',status:'SENT_FOR_CAPTURE'};
test('documented webhook envelope yields a minimal exact-amount hint, not a verified payment',()=>{
 const hint=payGlocalWebhookHint({...event,email:'not-persisted@example.test',cardBrand:'VISA',amountMinor:'999999'},'testmerchant')!;
 assert.equal(hint.amountMinor,'10001');assert.equal('email' in hint,false);assert.equal('cardBrand' in hint,false);assert.equal('source' in hint,false);
});
test('foreign MID, absent references and malformed financial amounts cannot enqueue a hint',()=>{
 for(const patch of [{merchantId:'other'},{merchantTxnId:''},{gid:''},{amount:100},{amount:'1e2'},{amount:'0100'},{amount:'100.001'},{amount:'-1'},{currency:'inr'},{status:'x'.repeat(65537)}])assert.equal(payGlocalWebhookHint({...event,...patch},'testmerchant'),null);
 for(const value of [null,[],{},'forged-token'])assert.equal(payGlocalWebhookHint(value,'testmerchant'),null);
});
test('webhook minor-unit conversion preserves exact large decimal values without floats',()=>{
 assert.equal(payGlocalWebhookHint({...event,amount:'99999999999999.99'},'testmerchant')!.amountMinor,'9999999999999999');
 for(const amount of ['0','0.0','0.00'])assert.equal(payGlocalWebhookHint({...event,amount},'testmerchant')!.amountMinor,'0');
});

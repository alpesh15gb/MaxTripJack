import test from 'node:test';
import assert from 'node:assert/strict';
import {displayMoney} from '../src/lib/display-money';
import {comparableFareEstimate,haveComparableCurrency,orderFareOffers} from '../src/lib/fare-display';

test('transactional INR uses two decimal places without changing paise',()=>{
 for(const [amount,label] of [[324850,'₹3,248.50'],[3056704,'₹30,567.04'],[3962230,'₹39,622.30'],[10000,'₹100.00'],[0,'₹0.00']] as const)assert.equal(displayMoney(amount),label);
 for(const amount of [NaN,Infinity,1.2,Number.MAX_SAFE_INTEGER+1])assert.equal(displayMoney(amount),'Price unavailable');
});
test('offers sort stably by comparable INR estimates, retain every identity and never mutate source',()=>{
 const offers=[{id:'corporate-high',customerEstimateMinor:779950},{id:'corporate-low',customerEstimateMinor:326150},{id:'published',customerEstimateMinor:324850},{id:'equal',customerEstimateMinor:326150},{id:'unknown'}];
 assert.equal(haveComparableCurrency(offers,'INR'),true);
 const before=JSON.stringify(offers),sorted=orderFareOffers(offers,'INR');
 assert.deepEqual(sorted.map(o=>o.id),['published','corporate-low','equal','corporate-high','unknown']);
 assert.equal(JSON.stringify(offers),before);assert.equal(sorted[0],offers[2]);assert.equal(sorted.length,offers.length);
});
test('mixed or explicit unknown currencies never receive misleading numeric ordering',()=>{
 for(const currency of ['USD','', 'inr']){
 const offers=[{id:'inr',currency:'INR',customerEstimateMinor:20000},{id:'other',currency,customerEstimateMinor:100}];
 assert.equal(haveComparableCurrency(offers,'INR'),false);assert.deepEqual(orderFareOffers(offers,'INR'),offers);assert.equal(comparableFareEstimate(offers[1],'INR'),null);
 }
 assert.deepEqual(orderFareOffers([{customerEstimateMinor:200},{customerEstimateMinor:100}],''),[{customerEstimateMinor:200},{customerEstimateMinor:100}]);
});
test('missing, fractional, nonpositive and nonfinite estimates stay unpriced in stable order',()=>{
 const offers=[{id:'missing'},{id:'null',customerEstimateMinor:null},{id:'nan',customerEstimateMinor:NaN},{id:'zero',customerEstimateMinor:0},{id:'negative',customerEstimateMinor:-1},{id:'fraction',customerEstimateMinor:1.1},{id:'valid',customerEstimateMinor:100}];
 assert.deepEqual(orderFareOffers(offers,'INR').map(o=>o.id),['valid','missing','null','nan','zero','negative','fraction']);
 for(const offer of offers.slice(0,-1))assert.equal(comparableFareEstimate(offer,'INR'),null);
});

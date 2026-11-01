import test from 'node:test';
import assert from 'node:assert/strict';
import {billingSchema,billingForProduct} from '../src/lib/billing';
const identity={firstName:'Payer',lastName:'Example',emailId:'payer@example.test',addressCountry:'IND'};
test('hotel payer identity does not require an unnecessary street address',()=>{assert.deepEqual(billingForProduct('HOTEL').parse(identity),identity);assert.throws(()=>billingForProduct('FLIGHT').parse(identity));});
test('blank optional addresses canonicalize across encrypted JSON and exact checkout retries',()=>{const parsed=billingSchema.parse({...identity,addressStreet1:'',addressCity:' ',addressState:''});assert.deepEqual(parsed,JSON.parse(JSON.stringify(parsed)));assert.deepEqual(parsed,billingSchema.parse(identity));});
test('payer fields reject injected credentials and invalid countries rather than forwarding them',()=>{assert.throws(()=>billingSchema.parse({...identity,cardNumber:'synthetic-injected'}));assert.throws(()=>billingSchema.parse({...identity,addressCountry:'ZZZ'}));assert.throws(()=>billingSchema.parse({...identity,lastName:'Name\nInjected'}));});

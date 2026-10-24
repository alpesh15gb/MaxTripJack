import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { serviceConditions } from '../src/service-conditions.ts';
import { valid, unsafe } from './fixtures/service-conditions.mjs';

test('native service DTO preserves supported labelled terms without supplier JSON',()=>{
 const parsed=serviceConditions(valid);
 assert.equal(parsed.blocked,false);
 assert.deepEqual(parsed.lines,valid.lines);
});
test('native strictly refuses malformed, unsupported or missing disclosures',()=>{
 for(const review of unsafe){
  const parsed=serviceConditions(review);
  assert.equal(parsed.blocked,true);
  assert.deepEqual(parsed.lines,[]);
  assert.doesNotMatch(JSON.stringify(parsed),/PRIVATE_SUPPLIER_VALUE/);
 }
});
test('native confirmation guard precedes recovery persistence and every payment call',()=>{
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 const service=app.slice(app.indexOf('function NativeFlightServices('),app.indexOf('function NativeApp('));
 assert.match(service,/const conditions=serviceConditions\(quote\?\.review\)/);
 assert.doesNotMatch(service,/JSON\.stringify\(quote.review/);
 assert.match(service,/conditions\.lines\.map/);
 assert.match(service,/disabled=\{busy\|\|!consent\|\|paymentSafety.blocked\|\|conditions.blocked\}/);
 const guard=service.indexOf('if(conditions.blocked)throw Error(');
 assert.ok(guard>0);
 assert.ok(guard<service.indexOf('await paymentSafety.start('));
 assert.ok(guard<service.indexOf('"/api/payments/create"'));
 assert.match(service,/Confirmation is unavailable; contact support/);
});

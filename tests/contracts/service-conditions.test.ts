// Exercise the same complete fixture matrix as the independent native checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {serviceConditions as nativeConditions} from '../../mobile-app/src/service-conditions';
import {serviceConditions as webConditions} from '../../booking-platform/src/lib/service-conditions';
import {valid,unsafe} from '../../mobile-app/tests/fixtures/service-conditions.mjs';

test('native and web strictly refuse the same malformed, unsupported or missing disclosures',()=>{
 for(const review of [valid,{version:1,blocked:true,lines:[]},...unsafe])assert.deepEqual(nativeConditions(review),webConditions(review));
});

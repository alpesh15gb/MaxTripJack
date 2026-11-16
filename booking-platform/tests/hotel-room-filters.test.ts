import test from 'node:test';
import assert from 'node:assert/strict';
import {includesBreakfast,hasFreeCancellation,filterRoomPlans} from '../src/lib/hotel-room-filters';
const now=Date.parse('2026-11-16T10:00:00+05:30');
const free={isRefundable:true,penalties:[{from:'2026-11-16T00:00:00+05:30',to:'2026-11-17T00:00:00+05:30',amount:0}]};
test('breakfast filters require an explicit included rate benefit',()=>{
 assert.equal(includesBreakfast({mealBasis:'BREAKFAST'}),true);
 assert.equal(includesBreakfast({mealBasis:'ROOM_ONLY',inclusions:['Breakfast included']}),false);
 assert.equal(includesBreakfast({inclusions:['Complimentary breakfast']}),true);
 for(const mealBasis of ['ROOM_ONLY','BREAKFAST_NOT_INCLUDED','BREAKFAST_FOR_A_FEE','UNKNOWN'])assert.equal(includesBreakfast({mealBasis}),false);
 for(const text of ['Breakfast available','No complimentary breakfast','Breakfast not included','Breakfast for a fee'])assert.equal(includesBreakfast({inclusions:[text]}),false);
});
test('free-cancellation filters exclude unknown, expired, charged, contradictory and overlapping terms',()=>{
 assert.equal(hasFreeCancellation({cancellation:free},now),true);
 for(const cancellation of [undefined,{isRefundable:true},{...free,isRefundable:false},{...free,penalties:[{...free.penalties[0],amount:10}]},{...free,penalties:[...free.penalties,{...free.penalties[0],amount:10}]}])assert.equal(hasFreeCancellation({cancellation},now),false);
 assert.equal(hasFreeCancellation({cancellation:free},null),false);
 assert.equal(hasFreeCancellation({cancellation:free},Date.parse('2026-11-17T00:00:00+05:30')),false);
});
test('combined room filters preserve exact option identity and reset retains unknown terms',()=>{
 const plans=[{optionId:'all',mealBasis:'BREAKFAST',cancellation:free},{optionId:'meal',mealBasis:'BREAKFAST'},{optionId:'unknown'}];
 assert.deepEqual(filterRoomPlans(plans,{breakfast:true,freeCancellation:true},now).map(plan=>plan.optionId),['all']);
 assert.deepEqual(filterRoomPlans(plans,{breakfast:false,freeCancellation:false},now),plans);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {includesBreakfast,hasFreeCancellation,filterRoomPlans,roomMealLabel} from '../src/lib/hotel-room-filters';
const now=Date.parse('2026-11-16T10:00:00+05:30');
const free={isRefundable:true,penalties:[{from:'2026-11-16T00:00:00+05:30',to:'2026-11-17T00:00:00+05:30',amount:0}]};
test('customer-facing meal names preserve restrictions and unknown supplier descriptions',()=>{
 assert.equal(roomMealLabel({mealBasis:'BB'}),'Breakfast included');
 assert.equal(roomMealLabel({mealBasis:'ROOM_ONLY',inclusions:['Complimentary breakfast']}),'Room only');
 assert.equal(roomMealLabel({inclusions:['Daily breakfast included']}),'Breakfast included');
 assert.equal(roomMealLabel({mealBasis:'BREAKFAST_FOR_A_FEE'}),'BREAKFAST FOR A FEE');
 assert.equal(roomMealLabel({mealBasis:'Dinner for one adult'}),'Dinner for one adult');
 assert.equal(roomMealLabel({}),'Meal plan not supplied');
});
test('breakfast filters require an explicit included rate benefit',()=>{
 assert.equal(includesBreakfast({mealBasis:'BREAKFAST'}),true);
 assert.equal(includesBreakfast({mealBasis:'ROOM_ONLY',inclusions:['Breakfast included']}),false);
 assert.equal(includesBreakfast({inclusions:['Complimentary breakfast']}),true);
 for(const mealBasis of ['ROOM_ONLY','BREAKFAST_NOT_INCLUDED','BREAKFAST_FOR_A_FEE','UNKNOWN'])assert.equal(includesBreakfast({mealBasis}),false);
 for(const text of ['Breakfast available','No complimentary breakfast','Breakfast not included','Breakfast for a fee'])assert.equal(includesBreakfast({inclusions:[text]}),false);
 for(const optionType of ['SRCM',' crcm ']){
  const mixed={optionType,mealBasis:'BREAKFAST',inclusions:['Complimentary breakfast']};
  assert.equal(includesBreakfast(mixed),false);
  assert.equal(roomMealLabel(mixed),'Meal plans vary by room');
 }
 assert.equal(includesBreakfast({optionType:'CRSM',mealBasis:'BREAKFAST'}),true);
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

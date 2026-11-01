import test from "node:test";
import assert from "node:assert/strict";
import {cancellationReconciliation as schedule} from "../src/lib/cancellation-reconciliation";
const base={product:"HOTEL" as const,supplierStatus:"CANCELLATION_PENDING",attempts:1,submittedAt:new Date("2026-11-01T00:00:00Z"),now:new Date("2026-11-01T00:00:10Z"),error:null};
test("hotel operations-pending status is checked daily without an attempt ceiling",()=>{for(const attempts of [1,5,1000])assert.equal(schedule({...base,attempts}).delaySeconds,86400);});
test("unknown outcomes remain scheduled and transport failures escalate",()=>{assert.equal(schedule({...base,supplierStatus:null,attempts:4,error:"SUPPLIER_UNAVAILABLE"}).delaySeconds,30);const later=schedule({...base,supplierStatus:null,attempts:5,error:"SUPPLIER_UNAVAILABLE"});assert.equal(later.delaySeconds,86400);assert.equal(later.followUpRequired,true);});
test("flight amendment recovery slows down and keeps checking",()=>{assert.equal(schedule({...base,product:"FLIGHT",attempts:99}).delaySeconds,3600);assert.equal(schedule({...base,product:"FLIGHT",error:"AMENDMENT_REFERENCE_UNAVAILABLE"}).followUpRequired,true);});
test("one day pending triggers staff follow-up even with successful status responses",()=>{assert.equal(schedule(base).followUpRequired,false);assert.equal(schedule({...base,now:new Date("2026-11-02T00:00:00Z")}).followUpRequired,true);});


test("operations follow-up filtering selects pending work without changing stored states",async()=>{
 const {adminRegisterQuery}=await import("../src/lib/admin-register-query");const q=adminRegisterQuery("cancellations",new URLSearchParams({status:"FOLLOW_UP_REQUIRED",q:"hotel"}));assert.match(q.where,/status='SUPPLIER_PENDING'/);assert.match(q.where,/follow_up_required_at IS NOT NULL/);assert.deepEqual(q.values,["%hotel%"]);
});

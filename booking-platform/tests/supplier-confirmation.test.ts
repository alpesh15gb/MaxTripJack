import test from "node:test";
import assert from "node:assert/strict";
import { supplierConfirmation } from "../src/lib/supplier-confirmation";
test("confirmation projection includes PNRs and tickets without replicating passports or PAN",()=>{const result=supplierConfirmation({itemInfos:{AIR:{travellers:[{fN:"Sample",lN:"Guest",pNum:"PRIVATE-PASSPORT",pan:"PRIVATE-PAN",pnrDetails:{a:"ABC123",b:"ABC123"},ticketNumberDetails:{a:"1234567890123"}}]}}});assert.deepEqual(result.pnrs,["ABC123"]);assert.deepEqual(result.passengers[0].tickets,["1234567890123"]);assert.equal(JSON.stringify(result).includes("PRIVATE"),false);assert.equal(supplierConfirmation(null).passengers.length,0);});

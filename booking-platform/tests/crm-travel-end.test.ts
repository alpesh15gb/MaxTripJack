import {test} from "node:test";import assert from "node:assert/strict";import {crmTravelEnd} from "../src/lib/crm-travel-end";
test("CRM keeps hotel checkout and supplier overnight/return arrivals, not departure-only guesses",()=>{
 assert.equal(crmTravelEnd("HOTEL",{checkOut:"2027-03-08"}),"2027-03-08");assert.equal(crmTravelEnd("HOTEL",{checkOut:"2027-02-30"}),null);
 assert.equal(crmTravelEnd("FLIGHT",{date:"2027-03-01"}),null);
 assert.equal(crmTravelEnd("FLIGHT",{date:"2027-03-01"},{tripInfos:[{sI:[{at:"2027-03-02T04:00:00"}]}]}),"2027-03-02");
 assert.equal(crmTravelEnd("FLIGHT",{date:"2027-03-01",returnDate:"2027-03-10"},{tripInfos:[{sI:[{at:"2027-03-02T04:00:00"}]}]}),null);
 assert.equal(crmTravelEnd("FLIGHT",{date:"2027-03-01",returnDate:"2027-03-10"},{tripInfos:[{sI:[{at:"2027-03-11T01:00:00"}]},{sI:[{at:"2027-03-02T04:00:00"}]}]}),"2027-03-11");
 assert.equal(crmTravelEnd("FLIGHT",{date:"2027-03-01"},{tripInfos:[{sI:[{at:"2027-03-02T04:00:00"},{}]}]}),null);
 assert.equal(crmTravelEnd("FLIGHT",{date:"2027-03-01"},{passport:{at:"2099-01-01"}},{tripInfos:[{sI:[{at:"2027-03-02T04:00:00"}]}]}),"2027-03-02");
});

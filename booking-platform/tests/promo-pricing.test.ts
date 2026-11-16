import test from 'node:test';
import assert from 'node:assert/strict';
import { promoDiscount, type PromoRule } from '../src/lib/promo-calculation';
import { paymentFailureAction } from '../src/lib/booking-presentation';
import { customerTotal } from '../src/lib/pricing-calculation';
const now=Date.UTC(2026,10,16);
const promo:PromoRule={product:'ALL',active:true,expires_at:new Date(now+60000),discount_minor:0,discount_basis_points:1000,minimum_minor:0,maximum_discount_minor:null};
test('service fee percentage uses supplier cost, not marked-up selling price',()=>{
 assert.equal(customerTotal(1000000,{markup_minor:5000,markup_basis_points:1000,service_fee_minor:2500,service_fee_basis_points:200}),1127500);
 assert.equal(customerTotal(1000000,{markup_minor:0,markup_basis_points:0,margin_basis_points:1000,service_fee_minor:0,service_fee_basis_points:200}),1131112);
 assert.equal(customerTotal(101,{markup_minor:0,markup_basis_points:0,service_fee_minor:0,service_fee_basis_points:5000}),152);
 for(const rate of [-1,10001,1.5,NaN])assert.throws(()=>customerTotal(100,{markup_minor:0,markup_basis_points:0,service_fee_minor:0,service_fee_basis_points:rate}));
});
test('percentage and fixed promotions respect caps and the supplier floor',()=>{
 assert.equal(promoDiscount(promo,'HOTEL',1200000,1000000,now),120000);
 assert.equal(promoDiscount(promo,'FLIGHT',1050000,1000000,now),50000);
 assert.equal(promoDiscount({...promo,maximum_discount_minor:25000},'HOTEL',1200000,1000000,now),25000);
 assert.equal(promoDiscount({...promo,discount_minor:300000,discount_basis_points:0},'HOTEL',1200000,1000000,now),200000);
 assert.throws(()=>promoDiscount(promo,'HOTEL',1000000,1000000,now),/no available discount/);
});
test('inactive, expired, ineligible and below-minimum promotions are rejected',()=>{
 assert.throws(()=>promoDiscount({...promo,active:false},'FLIGHT',1200000,1000000,now),/inactive/);
 assert.throws(()=>promoDiscount({...promo,expires_at:new Date(now)},'FLIGHT',1200000,1000000,now),/expired/);
 assert.throws(()=>promoDiscount({...promo,product:'HOTEL'},'FLIGHT',1200000,1000000,now),/service/);
 assert.throws(()=>promoDiscount({...promo,minimum_minor:1300000},'FLIGHT',1200000,1000000,now),/minimum/);
});

test("known promo rejection allows correction while unknown payment errors retain recovery",()=>{assert.equal(paymentFailureAction(409,"Promo expired","PROMO_REVIEW_REQUIRED"),"promo");assert.equal(paymentFailureAction(409,"Unknown error"),"status");});

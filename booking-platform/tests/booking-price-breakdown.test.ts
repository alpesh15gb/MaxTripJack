import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingPriceBreakdown,bookingReceiptPrice} from '../src/lib/booking-price-breakdown';
import {hotelDescription,hotelRateContent} from '../src/lib/hotel-presentation';
import {bookingStatusView} from '../src/lib/booking-status';

test('flight and hotel breakdowns reconcile to the reviewed customer total and omit incomplete splits',()=>{
  const flight={totalPriceInfo:{totalFareDetail:{fC:{BF:4000,TAF:1000.25,TF:5000.25}}}};
  assert.deepEqual(bookingPriceBreakdown('FLIGHT',flight,550125),{baseMinor:450100,taxMinor:100025,managementFeeMinor:0,managementTaxMinor:0});
  const hotel={option:{pricing:{currency:'INR',basePrice:3000,taxes:540,mf:100,mft:18,totalPrice:3658}}};
  const receipt=bookingReceiptPrice('HOTEL',hotel,375800,{discountMinor:5000},false);
  assert.deepEqual(receipt,[['Room rate',315000],['Supplier taxes and fees',54000],['Hotel management fee',10000],['Management fee tax',1800],['Promo discount',-5000]]);
  assert.equal(receipt.reduce((sum,[,value])=>sum+value,0),375800);
  assert.equal(bookingPriceBreakdown('HOTEL',{option:{pricing:{...hotel.option.pricing,taxes:undefined}}},390800),null);
});

test('broken stored descriptions are omitted and supplier rate instructions are readable',()=>{
  assert.deepEqual(hotelDescription({headline:'{"HeadLine":"Tucked away',storedDescription:'{"Overview":"Truncated'}),{});
  assert.deepEqual(hotelDescription({headline:'{"HeadLine":"A villa by the sea"}',default:'{"Overview":"<p>Three rooms</p>"}'}),
    {descriptionHeadline:'A villa by the sea',description:'Three rooms'});
  assert.equal(hotelRateContent([], 'Stay together.Contact the desk for a suitable room. "}').bookingNotes,
    'Stay together. Contact the desk for a suitable room.');
});

test('an airline confirmation with a PNR and no actual ticket number leaves the ticket step open',()=>{
  const input={product:'FLIGHT',status:'TICKETED',paymentStatus:'CAPTURED',totalMinor:'500025',
    passengers:[{name:'Test Traveller',pnrs:['TESTPNR'],tickets:['N/A']}]};
  const pending=bookingStatusView(input);
  assert.equal(pending.title,'Your flight booking is confirmed.');
  assert.equal(pending.confirmed,true);
  assert.equal(pending.documentReady,false);
  assert.equal(bookingStatusView({...input,passengers:[{...input.passengers[0],tickets:['12345']}]}).documentReady,true);
});

// Cross-app compatibility belongs to the monorepo, not the isolated web build.
import assert from 'node:assert/strict';
import test from 'node:test';
import {publicSupplierReview} from '../../booking-platform/src/lib/public-supplier-review';
import {reviewDisclosure} from '../../mobile-app/src/review-disclosure';

test('projected API review is consumed by the native named disclosure contract',()=>{
 const raw={conditions:{pcs:{pm:true,pped:true},dob:{adobr:true,cdobr:true,idobr:true},gst:{igm:true},iecr:true,ipa:true},fareRules:{fareRule:{miscInfo:'Known fare rule'}},option:{roomInfo:[{name:'Deluxe'}],bookingNotes:'Bring ID',compliance:{passportRequired:true,panRequired:true,gstType:'RESELLER'}}};
 const output=reviewDisclosure(publicSupplierReview('HOTEL',raw));
 for(const label of ['Passport','Passport expiry','Adult date of birth','Child date of birth','Infant date of birth','GST information','Emergency contact','Adult PAN'])assert.ok(output.includes(`${label}: required`));
 for(const text of ['Known fare rule','Rooms: Deluxe','Booking notes: Bring ID','GST type: RESELLER'])assert.ok(output.includes(text));
});

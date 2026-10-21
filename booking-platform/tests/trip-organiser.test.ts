import test from 'node:test';
import assert from 'node:assert/strict';
import { refundStage, sortTrips, travelCalendarDay, tripDates, tripGroup } from '../src/lib/trip-organiser';
const trip = (date: string, status = 'TICKETED') => ({status,created_at:'2026-10-01',itinerary_summary:{date}});
test('trip groups use last real travel date and never imply pending travel is confirmed',()=>{
 assert.equal(tripGroup(trip('2026-11-01'),'2026-10-21'),'UPCOMING');
 assert.equal(tripGroup(trip('2026-10-21'),'2026-10-21'),'UPCOMING');
 assert.equal(tripGroup(trip('2026-10-20'),'2026-10-21'),'PAST');
 assert.equal(tripGroup(trip('2026-11-01','PAID'),'2026-10-21'),'OTHER');
 assert.equal(tripGroup(trip('2026-11-01','CANCELLED'),'2026-10-21'),'CANCELLED');
 assert.equal(tripGroup(trip('2026-02-31'),'2026-10-21'),'OTHER');
 assert.equal(tripGroup({...trip('2026-10-01'),itinerary_summary:{date:'2026-10-01',returnDate:'2026-11-01'}},'2026-10-21'),'UPCOMING');
 assert.equal(tripGroup({...trip(''),itinerary_summary:{checkIn:'2026-10-20',checkOut:'2026-10-22'}},'2026-10-21'),'UPCOMING');
 assert.deepEqual(tripDates({...trip(''),itinerary_summary:{legs:[{date:'2026-11-05'},{date:'2026-11-01'}]}}),{start:'2026-11-01',end:'2026-11-05'});
});
test('upcoming is nearest first and past is latest first without mutating loaded data',()=>{
 const trips=[trip('2026-11-05'),trip('2026-11-01')];
 assert.equal(sortTrips(trips,'UPCOMING')[0].itinerary_summary.date,'2026-11-01');
 assert.equal(sortTrips(trips,'PAST')[0].itinerary_summary.date,'2026-11-05');
 assert.equal(trips[0].itinerary_summary.date,'2026-11-05');
});
test('refund labels distinguish approval, processing and reported completion without promises',()=>{
 assert.match(refundStage('APPROVED').description,/not yet confirmed completion/);
 assert.match(refundStage('PROCESSING').description,/not yet confirmed/);
 assert.match(refundStage('COMPLETED').description,/provider reports/);
 assert.match(refundStage('FAILED').description,/Contact support/);
 assert.equal(refundStage('UNRECOGNISED').label,'Refund status needs checking');
});

test("travel calendar uses India day at the UTC date boundary",()=>{
 assert.equal(travelCalendarDay(new Date("2026-10-21T20:00:00Z")),"2026-10-22");
 assert.equal(travelCalendarDay(new Date("2026-10-21T18:00:00Z")),"2026-10-21");
});

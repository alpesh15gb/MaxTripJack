import test from 'node:test';
import assert from 'node:assert/strict';
import {nextBookingSessionBoundary} from '../src/lib/booking-session';

test('inline guest verification keeps the public search workspace mounted',()=>{
  const guest=nextBookingSessionBoundary(null,null);
  const verified=nextBookingSessionBoundary(guest,'traveller-a');
  assert.equal(verified.revision,guest.revision);
  assert.equal(verified.userId,'traveller-a');
  assert.equal(nextBookingSessionBoundary(verified,'traveller-a'),verified);
});

test('sign-out and account changes clear the private workspace, including after guest verification',()=>{
  const verified=nextBookingSessionBoundary(nextBookingSessionBoundary(null,null),'traveller-a');
  const switched=nextBookingSessionBoundary(verified,'traveller-b');
  assert.equal(switched.revision,verified.revision+1);
  const signedOut=nextBookingSessionBoundary(switched,null);
  assert.equal(signedOut.revision,switched.revision+1);
  const returned=nextBookingSessionBoundary(signedOut,'traveller-a');
  assert.equal(returned.revision,signedOut.revision);
  assert.notEqual(returned.revision,verified.revision);
});

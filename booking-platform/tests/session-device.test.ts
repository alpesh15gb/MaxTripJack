import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionDevice,sessionStarted} from '../src/lib/session-device';
test('session labels show browser and platform without raw user-agent or fabricated identity',()=>{
 assert.equal(sessionDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537 Edg/140'),'Microsoft Edge on Windows');
 assert.equal(sessionDevice('Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit Version/18 Mobile Safari/604'),'Safari on iPhone');
 assert.equal(sessionDevice(null),'Unknown browser or device');
 assert.equal(sessionDevice('arbitrary-client-value'),'Browser');
});
test('session dates explicitly use India timezone and handle unavailable dates',()=>{
 assert.match(sessionStarted('2026-10-21T20:00:00Z'),/22 Oct 2026/);
 assert.match(sessionStarted('2026-10-21T20:00:00Z'),/IST$/);
 assert.equal(sessionStarted('invalid'),'Date unavailable');
});

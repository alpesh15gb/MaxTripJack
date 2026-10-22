import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchTiming} from '../src/lib/search-timing';
test('search timing contains only fixed aggregate durations including failed work',async()=>{
 let now=0;const timing=new SearchTiming(()=>now);
 assert.equal(await timing.measure('supplier',async()=>{now=120;return 42;}),42);
 assert.equal(timing.sync('projection',()=>{now=125;return 'safe';}),'safe');
 await assert.rejects(timing.measure('persist',async()=>{now=127;throw Error('secret not included');}));
 assert.equal(timing.header(),'supplier;dur=120.0, projection;dur=5.0, persist;dur=2.0, total;dur=127.0');
});

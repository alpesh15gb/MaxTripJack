import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { airlineLogo } from '../src/lib/airline-logo';
import catalogue from '../src/lib/airline-logos.json';
test('carrier logos use known codes and disambiguate shared codes',()=>{
 assert.equal(airlineLogo(' 6e ','IndiGo'),'/airlines/6E.png');
 assert.equal(airlineLogo('IX','Air India Express'),'/airlines/IX.png');
 assert.equal(airlineLogo('AS','Hawaiian Airlines'),'/airlines/AS-hawaiian-airlines.png');
 assert.equal(airlineLogo('AS','Unknown airline'),null);
 for(const code of [undefined,'ZZ','../AI','https://x.test'])assert.equal(airlineLogo(code),null);
});
test('every mapped logo is a local 96px PNG',async()=>{
 for(const entries of Object.values(catalogue))for(const item of entries){
  assert.match(item.file,/^[A-Za-z0-9-]+\.png$/);
  const bytes=await readFile(`public/airlines/${item.file}`);
  assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),96);assert.equal(bytes.readUInt32BE(20),96);
 }
});

import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/payments/payglocal/return/route";
import { POST as webhook } from "../src/app/api/webhooks/payglocal/route";
import {generateKeyPairSync} from 'node:crypto';

test("browser return is an untrusted hint, not payment verification", async () => {
  for (const handler of [GET, POST]) {
    const response = await handler();
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, "OUTCOME_UNCONFIRMED");
  }
});
test("unsigned PayGlocal webhook acknowledges delivery without touching financial state or the database", async () => {
  const response = await webhook();
  assert.equal(response!.status, 200);
  assert.deepEqual(await response!.json(), {received:true});
});
test('callback and webhook bodies are bounded without parsing or accepting financial claims',async()=>{for(const handler of [POST,webhook]){const response=await handler(new Request('https://merchant.example.test/callback',{method:'POST',body:'x'.repeat(65537)}));assert.equal(response.status,413);}});

test('configured web/app returns use fixed destinations and never treat posted tokens as payment proof',async()=>{
 const names=['PAYGLOCAL_ENV','PAYGLOCAL_MERCHANT_ID','PAYGLOCAL_PRIVATE_KEY_ID','PAYGLOCAL_PUBLIC_KEY_ID','PAYGLOCAL_PRIVATE_KEY','PAYGLOCAL_PUBLIC_KEY','BETTER_AUTH_URL'],prior=Object.fromEntries(names.map(name=>[name,process.env[name]])),keys=generateKeyPairSync('rsa',{modulusLength:2048});
 try{Object.assign(process.env,{PAYGLOCAL_ENV:'UAT',PAYGLOCAL_MERCHANT_ID:'synthetic',PAYGLOCAL_PRIVATE_KEY_ID:'signing',PAYGLOCAL_PUBLIC_KEY_ID:'encryption',PAYGLOCAL_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),PAYGLOCAL_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'}).toString(),BETTER_AUTH_URL:'https://merchant.example.test'});
 const browser=await GET(new Request('https://foreign.example.test/return?redirect=https://evil.test'));assert.equal(browser.status,303);assert.equal(browser.headers.get('location'),'https://merchant.example.test/my-trips');assert.equal(browser.headers.get('referrer-policy'),'no-referrer');
 const native=await POST(new Request('https://foreign.example.test/return?app=1&redirect=https://evil.test',{method:'POST',body:'forged-token-not-payment-proof'}));assert.equal(native.status,200);const html=await native.text();assert.match(html,/maxtravel:\/\/checkout-return/);assert.match(html,/does not confirm/);assert(!html.includes('evil.test'));assert(!html.includes('forged-token'));assert.match(native.headers.get('cache-control')??'',/no-store/);
 }finally{for(const name of names){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readSearchWarmScope} from '../src/lib/search-warm-identity';
import {issueShoppingToken,shoppingIdentity} from '../src/lib/guest-shopping-identity';

test('warm scope fingerprints auth cookie without authenticating, refreshing, or exposing its value',()=>{
 const request=(cookie:string)=>new Request('https://booking.example/api/travel/search/warm',{headers:{cookie}});
 const regular=readSearchWarmScope(request('better-auth.session_token=opaque-session.signed'));
 const secure=readSearchWarmScope(request('__Secure-better-auth.session_token=opaque-session.signed'));
 assert.equal(regular.actor,null);assert.equal(regular.sessionFingerprint,secure.sessionFingerprint);
 assert.match(regular.sessionFingerprint??'',/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(regular).includes('opaque-session'));
 const actual={userId:'authorized-account',companyId:'current-company'};
 assert.deepEqual(readSearchWarmScope(request('better-auth.session_token=opaque-session.signed'),actual).actor,actual);
});

test('existing guest identity is verified while a new anonymous warm creates no cookie/session',()=>{
 const before=process.env.BETTER_AUTH_SECRET,secret='synthetic-secret-longer-than-thirty-two-characters';process.env.BETTER_AUTH_SECRET=secret;
 try{
  const token=issueShoppingToken(secret),request=new Request('https://booking.example',{headers:{cookie:`maxtravel-shopping=${token}`}});
  assert.deepEqual(readSearchWarmScope(request).actor,{userId:shoppingIdentity(token,secret),companyId:null});
  assert.equal(readSearchWarmScope(new Request('https://booking.example')).actor,null);
  assert.equal(readSearchWarmScope(new Request('https://booking.example',{headers:{cookie:'maxtravel-shopping=invalid'}})).actor,null);
 }finally{if(before===undefined)delete process.env.BETTER_AUTH_SECRET;else process.env.BETTER_AUTH_SECRET=before;}
});

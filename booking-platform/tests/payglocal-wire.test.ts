import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,verify} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import {compactDecrypt} from 'jose';
import {payGlocalConfig} from '../src/lib/providers/payglocal-config';
import type * as Wire from '../src/lib/providers/payglocal-wire';
const merchant=generateKeyPairSync('rsa',{modulusLength:2048}),gateway=generateKeyPairSync('rsa',{modulusLength:2048});
const config={merchantId:'merchant_test',privateKid:'merchant_key',publicKid:'gateway_key',privateKey:merchant.privateKey.export({format:'pem',type:'pkcs8'}).toString(),publicKey:gateway.publicKey.export({format:'pem',type:'spki'}).toString(),origin:'https://booking.example.test'};
let wire:typeof Wire;
const ready=build({entryPoints:['src/lib/providers/payglocal-wire.ts'],bundle:true,platform:'node',format:'cjs',write:false,external:['jose','payglocal-js-client','payglocal-js-client/*'],plugins:[{name:'server-boundary',setup(p){p.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));p.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]}).then(output=>{const compiled={exports:{} as typeof Wire};new Function('module','exports','require',output.outputFiles[0].text)(compiled,compiled.exports,createRequire(path.resolve('package.json')));wire=compiled.exports;});
test('PayGlocal readiness requires UAT merchant keys and HTTPS; no gate bypass by a provider selector',()=>{
 const env={PAYGLOCAL_ENV:'UAT',PAYGLOCAL_MERCHANT_ID:config.merchantId,PAYGLOCAL_PRIVATE_KEY_ID:config.privateKid,PAYGLOCAL_PUBLIC_KEY_ID:config.publicKid,PAYGLOCAL_PRIVATE_KEY:config.privateKey,PAYGLOCAL_PUBLIC_KEY:config.publicKey,BETTER_AUTH_URL:config.origin};
 assert.equal(payGlocalConfig(env).merchantId,config.merchantId);
 for(const delta of [{PAYGLOCAL_ENV:'PRODUCTION'},{PAYGLOCAL_PRIVATE_KEY:''},{PAYGLOCAL_PUBLIC_KEY_ID:''},{BETTER_AUTH_URL:'http://booking.example.test'}])assert.throws(()=>payGlocalConfig({...env,...delta}));
});
test('vendor JWS digest, millisecond duration and protected headers verify independently',async(t)=>{
 await ready;t.mock.method(Date,'now',()=>1700000000000);
 const body='synthetic encrypted body',token=await wire.payGlocalJws(body,config),[h,p,s]=token.split('.');
 assert(verify('RSA-SHA256',Buffer.from(h+'.'+p),merchant.publicKey,Buffer.from(s,'base64url')));
 assert.deepEqual(JSON.parse(Buffer.from(p,'base64url').toString()),{digest:createHash('sha256').update(body).digest('base64'),digestAlgorithm:'SHA-256',exp:300000,iat:'1700000000000'});
 const header=JSON.parse(Buffer.from(h,'base64url').toString());assert.equal(header.alg,'RS256');assert.equal(header.kid,config.privateKid);assert.equal(header['x-gl-merchantId'],config.merchantId);
});
test('JWE exposes no billing identity and decrypts only with the gateway key',async()=>{
 await ready;
 const payload={paymentData:{totalAmount:'120.25',billingData:{emailId:'synthetic@example.test'}}};const token=await wire.payGlocalJwe(payload,config);assert.equal(token.split('.').length,5);assert(!token.includes('synthetic'));
 const clear=await compactDecrypt(token,gateway.privateKey);assert.deepEqual(JSON.parse(Buffer.from(clear.plaintext).toString()),payload);assert.equal(clear.protectedHeader.alg,'RSA-OAEP-256');assert.equal(clear.protectedHeader.enc,'A128CBC-HS256');await assert.rejects(()=>compactDecrypt(token,merchant.privateKey));
});
test('transport restricts host/path, signs exact encrypted bytes and never follows redirects',async()=>{
 await ready;
 let calls=0;const fetcher=async(url:unknown,init?:RequestInit)=>{calls++;assert.equal(url,'https://api.uat.payglocal.in/gl/v1/payments/initiate/paycollect');assert.equal(init?.redirect,'error');assert.equal(init?.method,'POST');assert.deepEqual(Object.keys(init?.headers??{}).sort(),['Content-Type','X-GL-TOKEN-EXTERNAL']);assert.equal((init?.headers as Record<string,string>)['Content-Type'],'text/plain');const bytes=String(init?.body),headers=init?.headers as Record<string,string>,parts=headers['X-GL-TOKEN-EXTERNAL'].split('.');assert.equal(JSON.parse(Buffer.from(parts[1],'base64url').toString()).digest,createHash('sha256').update(bytes).digest('base64'));const decoded=await compactDecrypt(bytes,gateway.privateKey);assert.equal(JSON.parse(Buffer.from(decoded.plaintext).toString()).merchantTxnId,'fixture123456789');return Response.json({status:'INPROGRESS',errors:null});};
 await wire.payGlocalRequest('/gl/v1/payments/initiate/paycollect',{merchantTxnId:'fixture123456789'},config,fetcher as typeof fetch);assert.equal(calls,1);
 for(const path of ['https://evil.test/','/gl/v1/payments/../status','/gl/v1/payments/id/status?token=foreign'])await assert.rejects(()=>wire.payGlocalRequest(path,undefined,config,fetcher as typeof fetch));assert.equal(calls,1);
});
test('authenticated status binds stored transaction, merchant, amount and every supplied currency alias',async()=>{
 await ready;
 const attempt={merchantTxnId:'fixture123456789',gid:'gl_original',merchantId:config.merchantId,amountMinor:12025,currency:'INR' as const};const data={gid:attempt.gid,merchantTxnId:attempt.merchantTxnId,'payment-method':'UPI_INTENT',Amount:'120.25',upiTxnAmount:'120.25',txnCurrency:'INR',Currency:'INR',status:'SENT_FOR_CAPTURE'};const raw={gid:'gl_status_request',status:'SENT_FOR_CAPTURE',data};
 assert.equal(wire.normalizePayGlocalStatus(raw,attempt,config).totalAmount,'120.25');
 assert.equal(wire.normalizePayGlocalStatus(raw,attempt,config).method,'upi');
 for(const delta of [{gid:'gl_foreign'},{merchantTxnId:'foreign'},{Amount:'120.24'},{upiTxnAmount:'120.26'},{Currency:'USD'},{status:'AUTHORIZED'},{merchantId:'foreign'}])assert.throws(()=>wire.normalizePayGlocalStatus({...raw,data:{...data,...delta}},attempt,config));
 assert.throws(()=>wire.normalizePayGlocalStatus({...raw,data:{}},attempt,config));assert.throws(()=>wire.normalizePayGlocalStatus(raw,attempt,{merchantId:'different'}));
});

test('bodyless status requests use SDK-signed empty bytes and keep the original merchant scope',async()=>{
 await ready;let count=0;
 await wire.payGlocalRequest('/gl/v1/payments/gl_original/status',undefined,config,(async(_,init)=>{
  count++;assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);const headers=init?.headers as Record<string,string>;assert.equal(headers['x-gl-merchantid'],config.merchantId);assert.equal(headers['x-gl-kid'],config.privateKid);
  const [h,p,s]=headers['X-GL-TOKEN-EXTERNAL'].split('.');assert(verify('RSA-SHA256',Buffer.from(h+'.'+p),merchant.publicKey,Buffer.from(s,'base64url')));assert.equal(JSON.parse(Buffer.from(p,'base64url').toString()).digest,createHash('sha256').update('').digest('base64'));return Response.json({status:'INPROGRESS'});
 }) as typeof fetch);assert.equal(count,1);
});

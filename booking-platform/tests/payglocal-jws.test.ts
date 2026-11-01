import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {verifyPayGlocalJws,type PayGlocalJwsPolicy} from "../src/lib/providers/payglocal-jws";
const pair=generateKeyPairSync("rsa",{modulusLength:2048}),other=generateKeyPairSync("rsa",{modulusLength:2048});
const now=new Date("2026-11-01T10:00:00Z");
const policy:PayGlocalJwsPolicy={publicKey:pair.publicKey.export({type:"spki",format:"pem"}).toString(),expectedKid:"fixture-webhook",issuer:"fixture-gateway",issuerClaim:"iss",issuerLocation:"payload",issuedAtClaim:"iat",timestampUnit:"seconds",maxAgeSeconds:300,clockSkewSeconds:30,now};
const claims={iss:"fixture-gateway",iat:now.getTime()/1000,merchantTxnId:"fixture-transaction",amount:"100.00"};
function token(header:Record<string,unknown>={alg:"RS256",kid:"fixture-webhook"},payload:unknown=claims,key=pair.privateKey){const body=[header,payload].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");return body+"."+sign("RSA-SHA256",Buffer.from(body),key).toString("base64url");}
test("pinned RSA verification establishes signature and explicit fixture freshness, not capture",()=>{const result=verifyPayGlocalJws(token(),policy);assert.equal(result.payload.merchantTxnId,"fixture-transaction");assert.equal(result.payload.source,undefined);});
test("wrong key, KID, algorithms and remote key selection fail closed",()=>{for(const header of [{alg:"none",kid:policy.expectedKid},{alg:"HS256",kid:policy.expectedKid},{alg:"RS256",kid:"other"},{alg:"RS256",kid:policy.expectedKid,jku:"https://attacker.test/keys"},{alg:"RS256",kid:policy.expectedKid,crit:["custom"]},{alg:"RS256",kid:policy.expectedKid,b64:false}])assert.throws(()=>verifyPayGlocalJws(token(header),policy));assert.throws(()=>verifyPayGlocalJws(token(undefined,claims,other.privateKey),policy));});
test("altered/truncated/noncanonical tokens and non-object payloads are rejected",()=>{const t=token();for(const value of [t.slice(0,-5),t+"=",t.replace(t.split(".")[1],Buffer.from(JSON.stringify({...claims,amount:"1.00"})).toString("base64url")),"a.b.c","x".repeat(65537),token(undefined,[]),token(undefined,null)])assert.throws(()=>verifyPayGlocalJws(value,policy));});
test("unknown issuer, missing clock, expired/future tokens and mixed timestamp units fail",()=>{for(const payload of [{...claims,iss:"other"},{iss:claims.iss},{...claims,iat:claims.iat-331},{...claims,iat:claims.iat+31},{...claims,iat:now.getTime()},{...claims,iat:"NaN"}])assert.throws(()=>verifyPayGlocalJws(token(undefined,payload),policy));});
test("millisecond/string issuance and header issuer require an explicit matching policy",()=>{const t=token({alg:"RS256",kid:policy.expectedKid,iss:"fixture-gateway"},{...claims,iat:String(now.getTime())});assert.doesNotThrow(()=>verifyPayGlocalJws(t,{...policy,issuerLocation:"header",timestampUnit:"milliseconds"}));assert.throws(()=>verifyPayGlocalJws(t,policy));});
test("no supplied signature key or unchecked policy enables runtime payments",()=>{assert.throws(()=>verifyPayGlocalJws(token(),{...policy,publicKey:pair.privateKey.export({type:"pkcs8",format:"pem"}).toString()}));assert.throws(()=>verifyPayGlocalJws(token(),{...policy,maxAgeSeconds:Infinity}));});


test("undersized RSA verification keys are rejected",()=>{const weak=generateKeyPairSync("rsa",{modulusLength:1024});assert.throws(()=>verifyPayGlocalJws(token(undefined,claims,weak.privateKey),{...policy,publicKey:weak.publicKey.export({type:"spki",format:"pem"}).toString()}));});

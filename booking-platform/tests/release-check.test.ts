import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {generateKeyPairSync} from 'node:crypto';
import { fileURLToPath } from "node:url";

// No inherited environment, .env files, real credentials, database or network.
const fixture: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PAYMENT_PROVIDER: "RAZORPAY",
  DATABASE_URL: "postgresql://maxtravel_app:fixture@127.0.0.1/disposable",
  BETTER_AUTH_URL: "https://merchant.example.test",
  BETTER_AUTH_SECRET: "a".repeat(32),
  TRAVELLER_ENCRYPTION_KEY: "a".repeat(64),
  TRIPJACK_FLIGHT_API_KEY: "fixture-flight",
  TRIPJACK_HOTEL_API_KEY: "fixture-hotel",
  RAZORPAY_KEY_ID: "rzp_test_fixture",
  RAZORPAY_KEY_SECRET: "fixture-key-secret",
  RAZORPAY_WEBHOOK_SECRET: "b".repeat(32),
  SMTP_HOST: "mail.example.test",
  MAIL_FROM: "fixture@example.test",
  CRM_EVENTS_URL: "https://crm.example.test/events",
  CRM_SIGNING_KEY: "c".repeat(32),
  CRM_KEY_ID: "fixture-crm",
};
function check(patch: Partial<NodeJS.ProcessEnv> = {}) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/release-check.mjs", import.meta.url))], {
    env: { ...fixture, ...patch }, encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("explicit historical Razorpay preserves UAT-only configuration readiness", () => {
  for (const PAYMENT_PROVIDER of ["RAZORPAY"]) {
    const result = check({ PAYMENT_PROVIDER });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UAT configuration checks passed for Razorpay test mode/);
    assert.match(result.stdout, /Production launch is not certified/);
    assert.match(result.stdout, /does not.*establish end-to-end payment readiness/);
  }
});

test("PayGlocal onboarding must provide UAT merchant identities and actual RSA files", () => {
  const result = check({ PAYMENT_PROVIDER: "PAYGLOCAL", RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, RAZORPAY_WEBHOOK_SECRET: undefined });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /PAYGLOCAL_ENV/);
  assert.match(result.stderr, /PAYGLOCAL_MERCHANT_ID/);
  assert.match(result.stderr, /PAYGLOCAL_KEYS/);
  assert.doesNotMatch(result.stderr, /RAZORPAY_|rzp_test/);
});

test("unknown payment provider fails closed without reflecting configuration values", () => {
  for (const PAYMENT_PROVIDER of ["INVALID-secret-marker", "payglocal", " RAZORPAY "]) {
    const result = check({ PAYMENT_PROVIDER });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PAYMENT_PROVIDER: unsupported value/);
    assert.ok(!result.stderr.includes(PAYMENT_PROVIDER));
    assert.equal(result.stdout, "");
  }
});

test('valid RSA credentials do not bypass the missing merchant travel payload',()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),config={PAYMENT_PROVIDER:'PAYGLOCAL',PAYGLOCAL_ENV:'UAT',PAYGLOCAL_MERCHANT_ID:'synthetic',PAYGLOCAL_PRIVATE_KEY_ID:'signing',PAYGLOCAL_PUBLIC_KEY_ID:'encryption',PAYGLOCAL_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),PAYGLOCAL_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}).toString(),RAZORPAY_KEY_ID:undefined,RAZORPAY_KEY_SECRET:undefined,RAZORPAY_WEBHOOK_SECRET:undefined};
 const result=check(config);assert.equal(result.status,1);assert.match(result.stderr,/PAYGLOCAL_TRAVEL_CONTRACT/);assert.equal(result.stdout,'');assert.equal(check({...config,PAYGLOCAL_ENV:'PRODUCTION'}).status,1);assert.equal(check({...config,PAYGLOCAL_PRIVATE_KEY:'invalid-key-marker'}).status,1);assert(!check({...config,PAYGLOCAL_PRIVATE_KEY:'invalid-key-marker'}).stderr.includes('invalid-key-marker'));
});

test("existing configuration safeguards remain enforced and secrets stay unprinted", () => {
  for (const patch of [
    { RAZORPAY_KEY_ID: "rzp_live_secret-marker" },
    { RAZORPAY_KEY_SECRET: undefined },
    { BETTER_AUTH_URL: "http://merchant.example.test" },
    { MIGRATION_DATABASE_URL: "postgresql://owner:secret-marker@localhost/db" },
  ]) {
    const result = check(patch);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes("secret-marker"));
    assert.ok(!result.stderr.includes(fixture.CRM_SIGNING_KEY!));
  }
});

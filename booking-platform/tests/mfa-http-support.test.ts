import test from 'node:test';
import assert from 'node:assert/strict';
import { disposableMfaConfig, LocalAuthCookies, totpFromSetupURI } from './mfa-http-support';
const config = { CI: 'true', DATABASE_URL: 'postgresql://fixture:public-test-value@127.0.0.1:55439/maxtravel_ci', BETTER_AUTH_URL: 'http://127.0.0.1:3000', SMTP_HOST: '127.0.0.1', SMTP_PORT: '11025', SMTP_SECURE: 'false' };
test('MFA HTTP guard accepts only explicit CI and exact local disposable services', () => {
  assert.equal(disposableMfaConfig(config).base, 'http://127.0.0.1:3000');
  for (const change of [{ CI: undefined }, { CI: 'false' }, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:55439/production' }, { DATABASE_URL: 'postgresql://u:p@remote.example:55439/maxtravel_ci' }, { DATABASE_URL: config.DATABASE_URL + '?host=remote.example' }, { DATABASE_URL: config.DATABASE_URL.replace(':55439', ':5432') }, { BETTER_AUTH_URL: 'https://maxtravel.in' }, { BETTER_AUTH_URL: 'http://user:secret@localhost:3000' }, { SMTP_HOST: 'smtp.example.com' }, { SMTP_PORT: '25' }]) assert.throws(() => disposableMfaConfig({ ...config, ...change }));
});
test('local cookie jar rotates, retains unrelated cookies and honours challenge expiry', () => {
  const jar = new LocalAuthCookies();
  jar.update(['session=public-old; Path=/; HttpOnly', 'challenge=public-challenge; Path=/; Max-Age=600']);
  jar.update(['session=public-new; Path=/; HttpOnly', 'challenge=; Max-Age=0; Path=/']);
  assert.equal(jar.header(), 'session=public-new');
  jar.update(['session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/']); assert.equal(jar.header(), '');
  assert.throws(() => jar.update(['bad=value; Domain=remote.example']));
});
test('TOTP independent computation matches public RFC 6238 SHA1 vectors', () => {
  // RFC 6238 Appendix B public test key, not a credential.
  const uri = 'otpauth://totp/RFC?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=30';
  for (const [seconds, code] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']] as const) assert.equal(totpFromSetupURI(uri, seconds * 1000), code);
  assert.equal(totpFromSetupURI(uri.replace('digits=8', 'digits=6'), 59000), '287082');
  for (const input of ['https://example.test', uri.replace('SHA1', 'SHA512') + '&algorithm=SHA512', uri.replace('period=30', 'period=0'), uri.replace('digits=8', 'digits=20'), uri.replace('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'invalid!')]) assert.throws(() => totpFromSetupURI(input, 59000));
});

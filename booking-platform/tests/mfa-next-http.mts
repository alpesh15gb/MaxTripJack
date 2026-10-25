/** Real CI-only BetterAuth/Next/PostgreSQL/Mailpit proof. No auth mocks or
 * direct writes to MFA state. Never print credentials, setup URIs or responses. */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { disposableMfaConfig, LocalAuthCookies, totpFromSetupURI } from './mfa-http-support';

let stage = 'configuration';
function requireFixture(value: unknown): asserts value { if (!value) throw Error('MFA lifecycle assertion failed.'); }
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function main() {
  const config = disposableMfaConfig(process.env); // BEFORE any HTTP or DB access.
  const pool = new Pool({ connectionString: config.databaseURL, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const email = `mfa-http-${randomUUID()}@example.test`, password = randomBytes(24).toString('hex');
  const cookies = new LocalAuthCookies(), challenges = new Set<string>(), mailIds = new Set<string>();
  let userId = '', failed = false;
  async function api(path: string, body?: unknown, cookieOverride?: string) {
    requireFixture(path.startsWith('/api/auth/'));
    const response = await fetch(`${config.base}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { origin: config.base, 'Content-Type': 'application/json', cookie: cookieOverride ?? cookies.header() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (cookieOverride === undefined) cookies.update(response.headers.getSetCookie());
    const data: unknown = await response.json(); return { response, data };
  }
  async function ownedSession(enabled?: boolean) {
    const result = await api('/api/auth/get-session'); const row = object(result.data), user = object(row.user), session = object(row.session);
    requireFixture(result.response.ok && user.id === userId && user.email === email && user.emailVerified === true && session.userId === userId && typeof session.id === 'string');
    if (enabled !== undefined) requireFixture(user.twoFactorEnabled === enabled);
    return session;
  }
  async function signedOut(cookieOverride?: string) {
    const result = await api('/api/auth/get-session', undefined, cookieOverride);
    requireFixture((result.response.status === 200 && result.data === null) || result.response.status === 401);
  }
  async function ownDevices() {
    const result = await api('/api/auth/list-sessions');
    requireFixture(result.response.ok && Array.isArray(result.data) && result.data.length === 1 && result.data.every(row => object(row).userId === userId));
  }
  async function challenge() {
    const result = await api('/api/auth/sign-in/email', { email, password });
    requireFixture(result.response.ok && object(result.data).twoFactorRedirect === true);
    await signedOut();
    // Read only this synthetic account's challenge identifiers so cleanup can
    // remove consumed-challenge attempt counters without touching rate limits.
    const own = await pool.query<{ identifier: string }>('SELECT identifier FROM verification WHERE value=$1', [userId]);
    for (const row of own.rows) if (row.identifier.startsWith('2fa-')) challenges.add(row.identifier);
  }
  async function verificationLink() {
    const deadline = Date.now() + 35000;
    while (Date.now() < deadline) {
      const response = await fetch(`${config.mail}/api/v1/messages`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      requireFixture(response.ok); const data = object(await response.json());
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const found = messages.map(object).find(item => item.Subject === 'Verify your Max Travel email' && Array.isArray(item.To) && item.To.some(recipient => object(recipient).Address === email));
      if (found) {
        requireFixture(typeof found.ID === 'string' && /^[A-Za-z0-9_-]+$/.test(found.ID)); mailIds.add(found.ID);
        const detail = await fetch(`${config.mail}/api/v1/message/${encodeURIComponent(found.ID)}`, { signal: AbortSignal.timeout(3000), redirect: 'error' }); requireFixture(detail.ok);
        const text = object(await detail.json()).Text; requireFixture(typeof text === 'string');
        const match = text.match(/https?:\/\/[^\s]+/); requireFixture(match);
        const url = new URL(match[0]); requireFixture(url.origin === config.base && url.pathname === '/api/auth/verify-email' && url.searchParams.has('token'));
        return url;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error('Local verification delivery timeout.');
  }
  try {
    stage = 'signup'; const signup = await api('/api/auth/sign-up/email', { email, password, name: 'Synthetic MFA HTTP Traveller', callbackURL: '/account' });
    requireFixture(signup.response.ok && typeof object(object(signup.data).user).id === 'string'); userId = String(object(object(signup.data).user).id);
    stage = 'local-email-verification'; const url = await verificationLink();
    const verification = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { origin: config.base, cookie: cookies.header() } }); cookies.update(verification.headers.getSetCookie());
    requireFixture(verification.ok || verification.status === 302);
    stage = 'initial-signin'; const signin = await api('/api/auth/sign-in/email', { email, password }); requireFixture(signin.response.ok && object(signin.data).twoFactorRedirect !== true); await ownedSession();
    const beforeEnrollmentCookie = cookies.header();
    stage = 'enable'; const enable = await api('/api/auth/two-factor/enable', { password }); const enrollment = object(enable.data);
    requireFixture(enable.response.ok && enrollment.method === 'totp' && typeof enrollment.totpURI === 'string' && Array.isArray(enrollment.backupCodes) && enrollment.backupCodes.length > 1 && enrollment.backupCodes.every(code => typeof code === 'string'));
    await ownedSession(false);
    const backupCode = enrollment.backupCodes[0];
    stage = 'verify-totp'; const verified = await api('/api/auth/two-factor/verify-totp', { code: totpFromSetupURI(enrollment.totpURI), trustDevice: false });
    requireFixture(verified.response.ok); await ownedSession(true); requireFixture(cookies.header() !== beforeEnrollmentCookie); await ownDevices();
    stage = 'rotated-session-denial'; await signedOut(beforeEnrollmentCookie);
    stage = 'first-signout'; requireFixture((await api('/api/auth/sign-out', {})).response.ok); await signedOut();
    stage = 'backup-challenge'; await challenge();
    stage = 'backup-first-use'; const backup = await api('/api/auth/two-factor/verify-backup-code', { code: backupCode, trustDevice: false });
    requireFixture(backup.response.ok && object(object(backup.data).user).id === userId); await ownedSession(true); await ownDevices();
    stage = 'second-signout'; requireFixture((await api('/api/auth/sign-out', {})).response.ok); await signedOut();
    stage = 'backup-reuse-challenge'; await challenge();
    stage = 'backup-reuse-rejected'; const reused = await api('/api/auth/two-factor/verify-backup-code', { code: backupCode, trustDevice: false });
    requireFixture(reused.response.status === 401 && object(reused.data).code === 'INVALID_BACKUP_CODE'); await signedOut();
  } catch { failed = true; console.error(`FAIL: disposable MFA HTTP lifecycle at ${stage}. Sensitive diagnostics suppressed.`); }
  finally {
    try {
      // Exact random synthetic email/id only. No auth/MFA state is provisioned
      // through SQL, and no rate-limit rows or unrelated users are removed.
      const own = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email=$1', [email]);
      const ids = own.rows.map(row => row.id); if (userId) requireFixture(ids.every(id => id === userId));
      if (ids.length) await pool.query('DELETE FROM verification WHERE value=ANY($1::text[])', [ids]);
      const challengeIds = [...challenges].flatMap(identifier => [identifier, `2fa-attempts-${identifier}`]);
      if (challengeIds.length) await pool.query('DELETE FROM verification WHERE identifier=ANY($1::text[])', [challengeIds]);
      await pool.query('DELETE FROM "user" WHERE email=$1', [email]);
      // Mailpit's documented DELETE would remove all mail for an empty list:
      // never issue it unless we captured this exact recipient's message IDs.
      if (mailIds.size) { const response = await fetch(`${config.mail}/api/v1/messages`, { method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...mailIds] }) }); requireFixture(response.ok); }
    } catch { failed = true; console.error('FAIL: disposable MFA fixture cleanup. Sensitive diagnostics suppressed.'); }
    finally { await pool.end(); }
  }
  if (failed) process.exitCode = 1;
  else console.log('PASS: real disposable Next/BetterAuth MFA enrollment, computed TOTP, session rotation, sign-out, challenge-only login, one-use backup recovery, reuse denial and owned device state. No mocked auth endpoints.');
}
await main().catch(() => { console.error(`FAIL: disposable MFA HTTP fixture at ${stage}. Sensitive diagnostics suppressed.`); process.exitCode = 1; });

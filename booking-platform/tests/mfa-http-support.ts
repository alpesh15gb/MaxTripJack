import { createHmac } from 'node:crypto';

/** Fail before any HTTP/DB access. No URL is repeated in an error message. */
export function disposableMfaConfig(env: Readonly<Record<string, string | undefined>>) {
  if (env.CI !== 'true') throw Error('MFA HTTP fixture requires explicit CI=true.');
  let database: URL, base: URL;
  try { database = new URL(env.DATABASE_URL || ''); base = new URL(env.BETTER_AUTH_URL || ''); } catch { throw Error('MFA HTTP fixture configuration is invalid.'); }
  const local = (host: string) => ['127.0.0.1', 'localhost'].includes(host);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !local(database.hostname) || database.port !== '55439' || database.pathname !== '/maxtravel_ci' || database.search || database.hash) throw Error('MFA HTTP fixture requires the dedicated loopback disposable database.');
  if (base.protocol !== 'http:' || !local(base.hostname) || base.port !== '3000' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw Error('MFA HTTP fixture requires the dedicated loopback Next server.');
  if (!local(env.SMTP_HOST || '') || env.SMTP_PORT !== '11025' || env.SMTP_SECURE !== 'false') throw Error('MFA HTTP fixture requires local Mailpit delivery.');
  return { databaseURL: database.toString(), base: base.origin, mail: 'http://127.0.0.1:18025' };
}

/** Root-path cookies from our one allowlisted auth origin, including rotations
 * and deletion directives. Values never appear in diagnostics or assertions. */
export class LocalAuthCookies {
  private values = new Map<string, string>();
  update(lines: readonly string[]) {
    for (const line of lines) {
      const [pair, ...attributes] = line.split(';'); const equal = pair.indexOf('=');
      if (equal <= 0) throw Error('Invalid local auth cookie response.');
      const name = pair.slice(0, equal).trim(), value = pair.slice(equal + 1);
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name)) throw Error('Invalid local auth cookie response.');
      const parsed = new Map(attributes.map(item => { const i = item.indexOf('='); return [item.slice(0, i < 0 ? undefined : i).trim().toLowerCase(), i < 0 ? '' : item.slice(i + 1).trim()]; }));
      if (parsed.has('domain') || (parsed.has('path') && parsed.get('path') !== '/')) throw Error('Unexpected local auth cookie scope.');
      const age = parsed.get('max-age'), expires = parsed.get('expires');
      if ((age !== undefined && Number(age) <= 0) || (age === undefined && expires && Date.parse(expires) <= Date.now())) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; '); }
}

/** Installed BetterAuth @better-auth/utils OTP emits base32(raw secret),
 * digits=6, period=30 and SHA-1. RFC 6238 calculation is independent of auth. */
export function totpFromSetupURI(value: string, now = Date.now()): string {
  let uri: URL; try { uri = new URL(value); } catch { throw Error('Invalid authenticator setup contract.'); }
  const encoded = uri.searchParams.get('secret') || '', digits = Number(uri.searchParams.get('digits') || 6), period = Number(uri.searchParams.get('period') || 30);
  if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp' || uri.username || uri.password || uri.hash || !/^[A-Z2-7]+={0,6}$/i.test(encoded) || ![6, 8].includes(digits) || period !== 30 || !Number.isSafeInteger(now) || now < 0 || !['SHA1', 'SHA-1'].includes((uri.searchParams.get('algorithm') || 'SHA1').toUpperCase())) throw Error('Unsupported authenticator setup contract.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bytes: number[] = []; let bits = 0, buffer = 0;
  for (const character of encoded.replace(/=+$/, '').toUpperCase()) { buffer = (buffer << 5) | alphabet.indexOf(character); bits += 5; if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); buffer &= (1 << bits) - 1; } }
  if (bytes.length < 10 || buffer !== 0) throw Error('Invalid authenticator setup contract.');
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / (period * 1000))));
  const key = Buffer.from(bytes); const digest = createHmac('sha1', key).update(counter).digest(); key.fill(0);
  const offset = digest[digest.length - 1] & 15; const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(number % 10 ** digits).padStart(digits, '0');
}

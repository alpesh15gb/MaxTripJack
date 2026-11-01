import { createPublicKey, verify } from "node:crypto";
import { HttpError } from "../http";

export type PayGlocalJwsPolicy = {
  publicKey: string; expectedKid: string; issuer: string;
  issuerClaim: string; issuerLocation: "header" | "payload";
  issuedAtClaim: string; timestampUnit: "seconds" | "milliseconds";
  maxAgeSeconds: number; clockSkewSeconds: number; now: Date;
};
const invalid = () => new HttpError(400, "Invalid PayGlocal signed message.");
function decode(value: string, maximum: number): Record<string, unknown> {
  if (!value || value.length > maximum || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw invalid();
  const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalid();
  return data as Record<string, unknown>;
}

/** Verification primitive, NOT a merchant webhook transport contract.
 * The caller must supply the confirmed issuer/clock/KID policy and establish
 * body, MID, reference and money bindings. No financial state changes here.
 * Runtime webhook activation remains held until that contract is confirmed. */
export function verifyPayGlocalJws(token: unknown, policy: PayGlocalJwsPolicy) {
  try {
    if (typeof token !== "string" || token.length > 65536 || !Number.isFinite(policy.now.getTime())
      || !Number.isInteger(policy.maxAgeSeconds) || policy.maxAgeSeconds < 1 || policy.maxAgeSeconds > 86400
      || !Number.isInteger(policy.clockSkewSeconds) || policy.clockSkewSeconds < 0 || policy.clockSkewSeconds > 300
      || !/^[A-Za-z0-9_-]{1,200}$/.test(policy.expectedKid) || !policy.issuer
      || !["header", "payload"].includes(policy.issuerLocation) || !["seconds", "milliseconds"].includes(policy.timestampUnit)
      || !policy.issuerClaim || !policy.issuedAtClaim || policy.publicKey.length > 32768
      || !/^-----BEGIN (PUBLIC KEY|CERTIFICATE)-----/.test(policy.publicKey.trim())) throw invalid();
    const parts = token.split(".");
    if (parts.length !== 3) throw invalid();
    const header = decode(parts[0], 4096);
    if (header.alg !== "RS256" || header.kid !== policy.expectedKid || header.crit !== undefined || header.b64 !== undefined
      || ["jku", "jwk", "x5u", "x5c"].some(key => header[key] !== undefined)
      || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw invalid();
    const key = createPublicKey(policy.publicKey);
    const signature = Buffer.from(parts[2], "base64url");
    if (signature.toString("base64url") !== parts[2] || key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, signature)) throw invalid();
    const payload = decode(parts[1], 60000);
    if ((policy.issuerLocation === "header" ? header : payload)[policy.issuerClaim] !== policy.issuer) throw invalid();
    const issued = payload[policy.issuedAtClaim];
    if (!((typeof issued === "number" && Number.isSafeInteger(issued)) || (typeof issued === "string" && /^\d{1,16}$/.test(issued)))) throw invalid();
    const value = Number(issued);
    if (!Number.isSafeInteger(value) || value < 0) throw invalid();
    const issuedSeconds = policy.timestampUnit === "milliseconds" ? value / 1000 : value;
    const now = policy.now.getTime() / 1000;
    if (issuedSeconds > now + policy.clockSkewSeconds || now - issuedSeconds > policy.maxAgeSeconds + policy.clockSkewSeconds) throw invalid();
    return { header, payload };
  } catch { throw invalid(); }
}

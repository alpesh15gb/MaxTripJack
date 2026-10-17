import { createHmac, timingSafeEqual } from "node:crypto";
export function signature(body: string, secret: string) { return createHmac("sha256", secret).update(body).digest("hex"); }
export function verifySignature(body: string, supplied: string | null, secret: string) {
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(signature(body, secret), "hex"), Buffer.from(supplied, "hex"));
}
export function crmSignature(timestamp: string, eventId: string, body: string, secret: string) { return signature(`${timestamp}.${eventId}.${body}`, secret); }

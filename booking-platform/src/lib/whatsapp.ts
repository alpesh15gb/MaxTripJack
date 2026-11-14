import "server-only";

export const WHATSAPP_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 32_768;
type EvolutionConfig = { baseURL: string; apiKey: string; instance: string };
type TransportOptions = { fetch?: typeof fetch; timeoutMs?: number };

export class WhatsAppDeliveryError extends Error {
  constructor(public outcome: "unavailable" | "rejected" | "unconfirmed") {
    super(outcome === "unavailable" ? "WhatsApp verification is temporarily unavailable. Use email or try again later." : "We couldn’t confirm the WhatsApp request. A code may still arrive; wait before requesting another code, or use email.");
    this.name = "WhatsAppDeliveryError";
  }
}

function configuration(): EvolutionConfig | null {
  const base = process.env.EVOLUTION_API_URL?.trim();
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  if (!base || !apiKey || !instance || instance.length > 128 || /[\x00-\x1f\x7f-\x9f/\\?#]/.test(instance) || instance === "." || instance === ".." || /[\r\n\0]/.test(apiKey)) return null;
  try {
    // Evolution instance names can contain spaces and Unicode. Keep the exact
    // configured name and encode it as one URL segment, never as a raw path.
    encodeURIComponent(instance);
    const url = new URL(base);
    // HTTP is supported for a private Docker network. The URL is operator-owned,
    // never supplied by a caller; redirects are forbidden for credential safety.
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return { baseURL: url.toString().replace(/\/+$/, ""), apiKey, instance };
  } catch { return null; }
}

export function whatsappReady() { return configuration() !== null; }

async function boundedJSON(response: Response) {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) { void response.body?.cancel().catch(() => {}); throw new WhatsAppDeliveryError("unconfirmed"); }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) { void response.body?.cancel().catch(() => {}); throw new WhatsAppDeliveryError("unconfirmed"); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); throw new WhatsAppDeliveryError("unconfirmed"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { reader.releaseLock(); }
}

async function request(path: string, body: object | undefined, options: TransportOptions) {
  const config = configuration();
  if (!config) throw new WhatsAppDeliveryError("unavailable");
  const controller = new AbortController();
  const timeout = Math.max(1, Math.min(options.timeoutMs ?? WHATSAPP_REQUEST_TIMEOUT_MS, WHATSAPP_REQUEST_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await (options.fetch ?? fetch)(`${config.baseURL}/${path}/${encodeURIComponent(config.instance)}`, {
      method: body ? "POST" : "GET", headers: { apikey: config.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: controller.signal,
    });
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new WhatsAppDeliveryError(response.status >= 500 ? "unconfirmed" : "rejected"); }
    return await boundedJSON(response);
  } catch (error) {
    if (error instanceof WhatsAppDeliveryError) throw error;
    // Provider bodies, URLs, tokens, recipients and transport errors stay private.
    throw new WhatsAppDeliveryError("unconfirmed");
  } finally { clearTimeout(timer); }
}

/** A provider acknowledgement means accepted for sending, not delivered/read.
 * Never retry automatically: a timeout can occur after WhatsApp accepted the code.
 * The v2 source schema uses top-level text (some hosted docs show a legacy shape).
 */
export async function sendWhatsAppCode(phoneE164: string, code: string, options: TransportOptions = {}) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164) || !/^\d{6}$/.test(code)) throw new WhatsAppDeliveryError("unavailable");
  const result = await request("message/sendText", {
    number: phoneE164.slice(1),
    text: `Your MaxTravel verification code is ${code}. It expires in 5 minutes and can be used once. Enter it only on the MaxTravel page where you requested it. Never share this code. If you did not request it, ignore this message.`,
    linkPreview: false,
  }, options);
  if (!result || typeof result !== "object" || !("key" in result) || !result.key || typeof result.key !== "object" || !("id" in result.key) || typeof result.key.id !== "string" || !result.key.id.trim() || ("success" in result && result.success === false) || ("error" in result && result.error) || ("status" in result && ["ERROR", "FAILED"].includes(String(result.status).toUpperCase()))) throw new WhatsAppDeliveryError("unconfirmed");
}

/** Read-only operator probe; sending a code does not create/reconnect instances. */
export async function whatsappConnectionReady(options: TransportOptions = {}) {
  const result = await request("instance/connectionState", undefined, options);
  return Boolean(result && typeof result === "object" && "instance" in result && result.instance && typeof result.instance === "object" && "state" in result.instance && result.instance.state === "open");
}

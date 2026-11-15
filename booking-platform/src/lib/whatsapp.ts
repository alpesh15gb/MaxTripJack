import "server-only";

export const WHATSAPP_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 32_768;
type EvolutionConfig = { baseURL: string; apiKey: string; instance: string };
type TransportOptions = { fetch?: typeof fetch; timeoutMs?: number };
type WhatsAppOperation = "send" | "connection";
const FAILURE_REASONS = ["configuration", "input", "provider-http", "response", "acknowledgement", "timeout", "transport"] as const;
type WhatsAppFailureReason = typeof FAILURE_REASONS[number];

export class WhatsAppDeliveryError extends Error {
  readonly reason: WhatsAppFailureReason;
  readonly httpStatus: number | null;
  constructor(public outcome: "unavailable" | "rejected" | "unconfirmed", metadata: { reason?: WhatsAppFailureReason; httpStatus?: number } = {}) {
    super(outcome === "unavailable" ? "WhatsApp verification is temporarily unavailable. Use email or try again later." : "We couldn’t confirm the WhatsApp request. A code may still arrive; wait before requesting another code, or use email.");
    this.name = "WhatsAppDeliveryError";
    this.reason = metadata.reason && FAILURE_REASONS.includes(metadata.reason) ? metadata.reason : "transport";
    this.httpStatus = typeof metadata.httpStatus === "number" && Number.isInteger(metadata.httpStatus) && metadata.httpStatus >= 100 && metadata.httpStatus <= 599 ? metadata.httpStatus : null;
  }
}

function reportFailure(operation: WhatsAppOperation, error: WhatsAppDeliveryError) {
  // Fixed labels and bounded status only. Never log the error object, provider
  // body, URL, instance name, recipient, verification code or credentials.
  console.error("WhatsApp transport", JSON.stringify({ operation, outcome: error.outcome, reason: error.reason, httpStatus: error.httpStatus }));
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
  const invalidResponse = () => new WhatsAppDeliveryError("unconfirmed", { reason: "response", httpStatus: response.status });
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) { void response.body?.cancel().catch(() => {}); throw invalidResponse(); }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) { void response.body?.cancel().catch(() => {}); throw invalidResponse(); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); throw invalidResponse(); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
    catch { throw invalidResponse(); }
  } finally { reader.releaseLock(); }
}

function acceptedSend(result: unknown) {
  return Boolean(result && typeof result === "object" && "key" in result && result.key && typeof result.key === "object" && "id" in result.key && typeof result.key.id === "string" && result.key.id.trim() && !("success" in result && result.success === false) && !("error" in result && result.error) && !("status" in result && ["ERROR", "FAILED"].includes(String(result.status).toUpperCase())));
}

async function request(operation: WhatsAppOperation, body: object | undefined, options: TransportOptions) {
  const controller = new AbortController();
  const timeout = Math.max(1, Math.min(options.timeoutMs ?? WHATSAPP_REQUEST_TIMEOUT_MS, WHATSAPP_REQUEST_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeout);
  let httpStatus: number | undefined;
  try {
    const config = configuration();
    if (!config) throw new WhatsAppDeliveryError("unavailable", { reason: "configuration" });
    const path = operation === "send" ? "message/sendText" : "instance/connectionState";
    const response = await (options.fetch ?? fetch)(`${config.baseURL}/${path}/${encodeURIComponent(config.instance)}`, {
      method: body ? "POST" : "GET", headers: { apikey: config.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: controller.signal,
    });
    httpStatus = response.status;
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new WhatsAppDeliveryError(response.status >= 500 ? "unconfirmed" : "rejected", { reason: "provider-http", httpStatus }); }
    const result = await boundedJSON(response);
    if (operation === "send" && !acceptedSend(result)) throw new WhatsAppDeliveryError("unconfirmed", { reason: "acknowledgement", httpStatus });
    return result;
  } catch (error) {
    // Provider bodies, URLs, tokens, recipients and transport errors stay private.
    const failure = error instanceof WhatsAppDeliveryError ? error : new WhatsAppDeliveryError("unconfirmed", { reason: controller.signal.aborted ? "timeout" : "transport", httpStatus });
    reportFailure(operation, failure);
    throw failure;
  } finally { clearTimeout(timer); }
}

/** A provider acknowledgement means accepted for sending, not delivered/read.
 * Never retry automatically: a timeout can occur after WhatsApp accepted the code.
 * The v2 source schema uses top-level text (some hosted docs show a legacy shape).
 */
export async function sendWhatsAppCode(phoneE164: string, code: string, options: TransportOptions = {}) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164) || !/^\d{6}$/.test(code)) {
    const failure = new WhatsAppDeliveryError("unavailable", { reason: "input" });
    reportFailure("send", failure);
    throw failure;
  }
  await request("send", {
    number: phoneE164.slice(1),
    text: `Your MaxTravel verification code is ${code}. It expires in 5 minutes and can be used once. Enter it only on the MaxTravel page where you requested it. Never share this code. If you did not request it, ignore this message.`,
    linkPreview: false,
  }, options);
}

/** Read-only operator probe; sending a code does not create/reconnect instances. */
export async function whatsappConnectionReady(options: TransportOptions = {}) {
  const result = await request("connection", undefined, options);
  return Boolean(result && typeof result === "object" && "instance" in result && result.instance && typeof result.instance === "object" && "state" in result.instance && result.instance.state === "open");
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function failure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: "Invalid request fields.", fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, 400);
  const reference = randomUUID();
  // Never log request bodies, provider responses, cookies, credentials or database URLs.
  console.error("Request failed", { reference, type: error instanceof Error ? error.name : "Unknown" });
  return json({ error: "The operation could not be completed.", reference }, 500);
}
export async function boundedText(request: Request, limit = 65536) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, "Request too large."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function body<T>(request: Request, schema: z.ZodType<T>) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "JSON required.");
  let value: unknown; try { value = JSON.parse(await boundedText(request)); } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Malformed JSON.");
  }
  return schema.parse(value);
}
export function sameOrigin(request: Request) {
  const configured = process.env.BETTER_AUTH_URL;
  if (!configured) throw new HttpError(503, "Application origin is not configured.");
  if (request.headers.get("origin") !== new URL(configured).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Request origin rejected.");
}

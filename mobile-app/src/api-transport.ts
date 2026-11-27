export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly hasServerError: boolean;

  constructor(status: number, message: string, code?: string, hasServerError = false) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.hasServerError = hasServerError;
  }
}

export function checkedApiOrigin(value: string | undefined, development: boolean): string {
  const input = value?.trim() || (development ? "http://127.0.0.1:3000" : "");
  if (!input || !/^https?:\/\/[^/?#@\\\s]+\/?$/i.test(input)) {
    throw Error("Set EXPO_PUBLIC_API_URL to the API origin.");
  }
  const url = new URL(input);
  if (url.username || url.password || (!development && url.protocol !== "https:")) {
    throw Error("Release builds require an HTTPS API origin without credentials.");
  }
  return url.origin;
}

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 45_000,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const isJson = (response.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
    const result: unknown = isJson ? await response.json().catch(() => null) : null;
    if (!response.ok) {
      const payload = result && typeof result === "object" ? result as Record<string, unknown> : null;
      const message = typeof payload?.error === "string" && payload.error.trim() ? payload.error : undefined;
      throw new ApiHttpError(response.status, message ?? "The service could not complete this request.",
        typeof payload?.code === "string" ? payload.code : undefined, message !== undefined);
    }
    if (timedOut) throw Error("Request timed out.");
    if (result === null) throw Error("The service returned an unexpected response.");
    return result as T;
  } catch (error) {
    if (timedOut) throw Error("The request timed out. Check its status before sending it again.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

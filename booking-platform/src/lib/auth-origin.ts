/** Keep the account-mail boundary and BetterAuth's origin policy aligned. */
export function authTrustedOrigins(baseURL: string): string[] {
  return [new URL(baseURL).origin, "maxtravel://"];
}

/** No cookies are needed to request account mail, so validate supplied browser
 * origin evidence explicitly. Headerless native clients remain supported.
 * This is intentionally not applied to token consumption or OAuth callbacks.
 */
export function accountMailOriginAllowed(request: Request, baseURL: string | undefined): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (origin === null && referer === null) return request.headers.get("sec-fetch-site") !== "cross-site";
  const value = origin ?? referer!;
  if (!value || /[\s\\\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  let trusted: string[];
  try { trusted = authTrustedOrigins(baseURL || ""); } catch { return false; }
  // Preserve BetterAuth's scheme-wide native trust, but not lookalike schemes.
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "maxtravel:" && value.startsWith("maxtravel://")) return true;
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (origin !== null && value !== url.origin) return false;
    return trusted.includes(url.origin);
  } catch { return false; }
}

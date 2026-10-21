/** Allow only customer workspaces. Never send authentication to an external URL. */
export function safeAccountReturn(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/my-trips";
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//")) return "/my-trips";
    const url = new URL(value, "https://account-return.invalid");
    if (url.origin !== "https://account-return.invalid" || !["/book", "/my-trips", "/travellers"].includes(url.pathname)) return "/my-trips";
    // Only non-sensitive search criteria may travel through authentication URLs.
    const safe = new URLSearchParams();
    const allowed = ["product", "from", "to", "date", "returnDate", "end", "adults", "children", "infants", "cabin", "city", "nationality", "rooms", "legs", "hotelIds", "autoSearch"];
    if (url.pathname === "/book") for (const key of allowed) { const value = url.searchParams.get(key); if (value !== null) safe.set(key, value); }
    if (url.pathname === "/book" && url.searchParams.get("resumeSelection") === "1") safe.set("resumeSelection", "1");
    const query = safe.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch { return "/my-trips"; }
}
export function accountHref(returnTo: string): string {
  return `/account?${new URLSearchParams({ returnTo: safeAccountReturn(returnTo) })}`;
}

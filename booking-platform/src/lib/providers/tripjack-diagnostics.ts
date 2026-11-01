/** Safe operational metadata, never the supplier body, headers, or error message. */
export function tripjackFailureMetadata(product: "FLIGHT" | "HOTEL", httpStatus: number | null, payload: unknown) {
  const errors = payload && typeof payload === "object" && "errors" in payload ? payload.errors : null;
  const codes = Array.isArray(errors) ? errors.slice(0, 8).flatMap(error => {
    if (!error || typeof error !== "object" || !("errCode" in error)) return [];
    const code = error.errCode;
    if (typeof code !== "string" && typeof code !== "number") return [];
    return /^\d{1,6}$/.test(String(code)) ? [String(code)] : [];
  }) : [];
  return { product, httpStatus, supplierErrorCodes: [...new Set(codes)] };
}

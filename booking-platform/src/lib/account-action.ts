/** A missing response is not proof that an account write failed. Never retry it here. */
export class AccountActionRejected extends Error {}
export async function confirmAccountAction<T extends { data?: unknown; error?: { status?: number; message?: string } | null }>(work: Promise<T>, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Account action outcome unknown")), timeoutMs);
    })]);
    if (result.error) {
      if (result.error.status && result.error.status >= 400 && result.error.status < 500) {
        throw new AccountActionRejected(result.error.message || "The request was not accepted. Request a fresh link or try again.");
      }
      throw new Error("Account action outcome unknown");
    }
    // The installed reset-password contract returns { status: true }.
    // A 2xx response with a missing/malformed body is not confirmation.
    if (!result.data || typeof result.data !== "object" || !("status" in result.data) || result.data.status !== true) throw new Error("Account action outcome unknown");
    return result;
  } finally { clearTimeout(timer); }
}

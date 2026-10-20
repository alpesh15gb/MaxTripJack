import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "./http";

type Client = Pick<PoolClient, "query">;
type Transaction = <T>(run: (client: Client) => Promise<T>) => Promise<T>;
export type FareValidationPhase = "PREPAYMENT" | "PREBOOK";

export class FareValidationBlockedError extends HttpError {
  constructor() {
    super(409, "This fare validation cannot be repeated safely. Review a new quote before paying; if payment was already taken, contact operations and do not pay again.");
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function fareValidationHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
}

/** Commit the start BEFORE dispatch; never replay an unknown or rejected call. */
export async function validateFareOnce(input: { quoteId: string; phase: FareValidationPhase; payload: unknown; transaction: Transaction; validate: () => Promise<void> }) {
  const hash = fareValidationHash(input.payload);
  // Only these server-controlled column names are interpolated. A successful
  // prepayment check must never replace the fresh post-payment check.
  const prefix = input.phase === "PREPAYMENT" ? "fare_validation" : "booking_validation";
  const started = await input.transaction(async tx => {
    const found = await tx.query<{ state: string | null; request_hash: string | null; prepayment_state: string | null; prepayment_hash: string | null }>(
      `SELECT ${prefix}_state AS state,${prefix}_hash AS request_hash,fare_validation_state AS prepayment_state,fare_validation_hash AS prepayment_hash FROM supplier_quotes WHERE id=$1 FOR UPDATE`, [input.quoteId],
    );
    const quote = found.rows[0];
    if (!quote) throw new FareValidationBlockedError();
    if (input.phase === "PREBOOK" && quote.prepayment_state
      && (quote.prepayment_state !== "SUCCEEDED" || quote.prepayment_hash !== hash)) throw new FareValidationBlockedError();
    // PREBOOK success is consumed by this worker invocation only. A later
    // invocation means it crashed before the durable Book marker; even an old
    // successful validation is not evidence of a still-current fare.
    if (input.phase === "PREPAYMENT" && quote.state === "SUCCEEDED" && quote.request_hash === hash) return false;
    if (quote.state) throw new FareValidationBlockedError();
    await tx.query(`UPDATE supplier_quotes SET ${prefix}_state='STARTED',${prefix}_hash=$2,${prefix}_started_at=now() WHERE id=$1`, [input.quoteId, hash]);
    return true;
  });
  if (!started) return;
  try {
    await input.validate();
    await input.transaction(async tx => {
      const saved = await tx.query(`UPDATE supplier_quotes SET ${prefix}_state='SUCCEEDED' WHERE id=$1 AND ${prefix}_state='STARTED' AND ${prefix}_hash=$2 RETURNING id`, [input.quoteId, hash]);
      if (!saved.rowCount) throw new FareValidationBlockedError();
    });
  } catch {
    // If even this write fails, STARTED is still a durable no-retry marker.
    try { await input.transaction(async tx => {
      await tx.query(`UPDATE supplier_quotes SET ${prefix}_state='BLOCKED' WHERE id=$1 AND ${prefix}_state='STARTED' AND ${prefix}_hash=$2`, [input.quoteId, hash]);
    }); } catch { /* Keep the previously committed STARTED marker. */ }
    throw new FareValidationBlockedError();
  }
}

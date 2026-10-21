import { json } from "@/lib/http";

// Browser/provider callbacks are untrusted hints, NEVER evidence of payment.
// No body is parsed, no outbound URL is followed and no booking is mutated.
export async function GET() {
  return json({ status: "OUTCOME_UNCONFIRMED", message: "Return received. Payment is not verified by this callback. Check My trips or contact operations; do not pay again." }, 202);
}
export async function POST() { return GET(); }

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { administrator } from "@/lib/access";
import { transaction, database } from "@/lib/db";
import { razorpay } from "@/lib/providers/razorpay";
import { body, sameOrigin, json, failure, HttpError } from "@/lib/http";
import { assertRecoverablePaymentIntent, persistGatewayOrder, type PaymentIntent } from "@/lib/payment-intent";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await administrator(request, "payments:manage");
    const input = await body(request, z.object({
      bookingId: z.string().uuid(),
      gatewayOrderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
    }).strict());
    const found = await database().query<PaymentIntent>(
      "SELECT g.provider,o.total_minor,o.status,g.state,g.gateway_order_id,g.created_at FROM orders o JOIN gateway_intents g ON g.order_id=o.id WHERE o.id=$1", [input.bookingId],
    );
    assertRecoverablePaymentIntent(found.rows[0], input.gatewayOrderId);
    // Read the supplied existing order; never create/re-submit an uncertain one.
    const gateway = await razorpay(`/orders/${encodeURIComponent(input.gatewayOrderId)}`);
    if (gateway.id !== input.gatewayOrderId) throw new HttpError(409, "Gateway order reference does not match.");
    await transaction(async tx => {
      // Recheck receipt, amount, currency and current state under both row locks.
      const result = await persistGatewayOrder(tx, input.bookingId, gateway, "RECOVER");
      if (result.linked) await tx.query(
        "INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'PAYMENT_ORDER_RECOVERED',$3,$4)",
        [randomUUID(), actor.userId, input.bookingId, { gatewayOrderId: input.gatewayOrderId }],
      );
    });
    return json({ message: "Existing gateway order verified and linked. Capture still requires a verified payment callback or webhook; no new payment order was created." });
  } catch (error) { return failure(error); }
}

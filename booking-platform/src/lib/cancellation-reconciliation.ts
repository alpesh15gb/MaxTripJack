/** Scheduling is independent of submission. A pending booking is never proof
 * of cancellation. TripJack's hotel CANCELLATION_PENDING is checked daily. */
export function cancellationReconciliation(input: {
  product: "FLIGHT" | "HOTEL"; supplierStatus: string | null;
  attempts: number; submittedAt: Date; now: Date; error: string | null;
}) {
  const daily = input.product === "HOTEL" && input.supplierStatus === "CANCELLATION_PENDING";
  const delaySeconds = daily ? 86400 : input.attempts < 5 ? 30 : input.product === "HOTEL" ? 86400 : 3600;
  const followUpRequired = input.now.getTime() - input.submittedAt.getTime() >= 86400000
    || (input.attempts >= 5 && Boolean(input.error))
    || input.error === "AMENDMENT_REFERENCE_UNAVAILABLE";
  return { delaySeconds, followUpRequired };
}

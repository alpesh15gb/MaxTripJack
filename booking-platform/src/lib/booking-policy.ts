import { HttpError } from "./http";
export const cancellationStates = ["REQUESTED", "UNDER_REVIEW", "AWAITING_ACCEPTANCE", "SUPPLIER_PENDING", "CONFIRMED", "REJECTED"] as const;
export function cancellationAllowed(status: string) {
  if (!["CONFIRMED", "TICKETED"].includes(status)) throw new HttpError(409, "Cancellation requests require a confirmed booking.");
}
export function refundableAmount(paidMinor: number, completedMinor: number, reservedMinor: number, requestedMinor: number) {
  for (const n of [paidMinor, completedMinor, reservedMinor, requestedMinor]) if (!Number.isSafeInteger(n) || n < 0) throw new HttpError(400, "Amounts must be non-negative integer minor units.");
  if (requestedMinor === 0 || requestedMinor > paidMinor - completedMinor - reservedMinor) throw new HttpError(409, "Requested refund exceeds the remaining refundable balance.");
  return requestedMinor;
}
export function canReadOrder(userId: string, companyId: string | null, order: { user_id: string; company_id: string | null }) {
  return companyId ? order.company_id === companyId : order.company_id === null && order.user_id === userId;
}

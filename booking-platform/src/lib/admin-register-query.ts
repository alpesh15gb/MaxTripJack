import { z } from "zod";
import { resources, type Resource } from "./admin-resources";
const searchColumns: Record<Resource, readonly string[]> = {
  bookings: ["id", "reference", "supplier_booking_id", "company_id"],
  companies: ["id", "name", "gst_number", "user_id"],
  pricing: ["id", "product", "company_name", "company_id"],
  cancellations: ["id", "reference", "reason"],
  payments: ["id", "reference", "gateway_order_id", "gateway_payment_id"],
  refunds: ["id", "reference", "payment_id", "reason", "gateway_refund_id", "settlement_reference"],
  sync: ["id", "aggregate_id", "event_type"],
  audit: ["id", "actor_id", "action", "entity_id"],
};
export function adminRegisterQuery(
  name: Resource,
  params: URLSearchParams,
  startValues: unknown[] = [],
) {
  const q = z
      .string()
      .trim()
      .max(100)
      .parse(params.get("q") ?? ""),
    status = z
      .string()
      .trim()
      .max(60)
      .parse(params.get("status") ?? "");
  const values = [...startValues],
    clauses: string[] = [];
  if (q) {
    values.push("%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
    clauses.push(
      "(" +
        searchColumns[name]
          .map((c) => 'r."' + c + '"::text ILIKE $' + values.length)
          .join(" OR ") +
        ")",
    );
  }
  if (
    status &&
    (resources[name].columns as readonly string[]).includes("status")
  ) {
    if(name === "cancellations" && status === "FOLLOW_UP_REQUIRED") clauses.push("r.status='SUPPLIER_PENDING' AND r.follow_up_required_at IS NOT NULL");
    else { values.push(status); clauses.push("r.status=$" + values.length); }
  }
  const base = resources[name].sql.replace(/ ORDER BY [^]*$/i, "");
  return {
    q,
    status,
    values,
    from: "FROM (" + base + ") r",
    where: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
  };
}

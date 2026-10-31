import { z } from "zod";
import { administrator } from "@/lib/access";
import { database } from "@/lib/db";
import { json, failure } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      kind = z.enum(["company", "payment"]).parse(params.get("kind")),
      q = z
        .string()
        .trim()
        .max(100)
        .parse(params.get("q") ?? ""),
      search = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    await administrator(
      request,
      kind === "company" ? "pricing:manage" : "refunds:manage",
    );
    const result =
      kind === "company"
        ? await database().query(
            "SELECT id,name AS label FROM companies WHERE status='APPROVED' AND (name ILIKE $1 OR id::text ILIKE $1) ORDER BY name,id LIMIT 31",
            [search],
          )
        : await database().query(
            "SELECT p.id,o.reference AS label,p.amount_minor::text AS amount_minor FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='CAPTURED' AND (o.reference ILIKE $1 OR p.id::text ILIKE $1) ORDER BY p.created_at DESC,p.id DESC LIMIT 31",
            [search],
          );
    return json({
      records: result.rows.slice(0, 30),
      hasMore: result.rows.length > 30,
    });
  } catch (e) {
    return failure(e);
  }
}

import { administrator } from "@/lib/access";
import { failure, json } from "@/lib/http";
import { readVisibilityLedger } from "@/lib/visibility-ledger";

export async function GET(request: Request) {
  try {
    await administrator(request, "finance:read");
    return json(await readVisibilityLedger());
  } catch (error) {
    return failure(error);
  }
}

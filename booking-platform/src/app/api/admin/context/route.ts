import { operationsAccess } from "@/lib/access";
import { json, failure } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const actor = await operationsAccess(request);
    return json({
      userId: actor.userId,
      name: actor.session.user.name,
      permissions: actor.permissions,
    });
  } catch (e) {
    return failure(e);
  }
}

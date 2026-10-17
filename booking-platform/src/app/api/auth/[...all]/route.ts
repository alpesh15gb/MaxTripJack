import { getAuth } from "@/lib/auth";
import { failure, HttpError } from "@/lib/http";
import { mailReady } from "@/lib/mail";
async function handle(request: Request) {
  try {
    // Privileged accounts cannot remove MFA through a generic client endpoint.
    if (new URL(request.url).pathname.endsWith("/two-factor/disable")) throw new HttpError(403, "Contact account administration for MFA recovery.");
    // Email delivery is a release dependency. Do not silently create unusable public accounts.
    if (new URL(request.url).pathname.endsWith("/sign-up/email") && !mailReady()) throw new HttpError(503, "Registration opens after email verification delivery is configured.");
    const response = await getAuth().handler(request);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) { return failure(e); }
}
export const GET = handle;
export const POST = handle;

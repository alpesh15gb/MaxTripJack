import { getAuth } from "@/lib/auth";
import { failure, HttpError } from "@/lib/http";
import { mailReady } from "@/lib/mail";
import { accountMailOriginAllowed } from "@/lib/auth-origin";
async function handle(request: Request) {
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const initiatesMail = ["/api/auth/sign-up/email", "/api/auth/request-password-reset", "/api/auth/send-verification-email"].includes(path);
    if (request.method === "POST" && initiatesMail && !accountMailOriginAllowed(request, process.env.BETTER_AUTH_URL)) throw new HttpError(403, "Untrusted account request origin.");
    // Privileged accounts cannot remove MFA through a generic client endpoint.
    if (path.endsWith("/two-factor/disable")) throw new HttpError(403, "Contact account administration for MFA recovery.");
    // Email delivery is a release dependency. Do not silently create unusable public accounts.
    if (path.endsWith("/sign-up/email") && !mailReady()) throw new HttpError(503, "Registration opens after email verification delivery is configured.");
    // Check delivery before account lookup so known and unknown emails have the same outage response.
    if (["/request-password-reset", "/send-verification-email"].some(endpoint => path.endsWith(endpoint)) && !mailReady()) throw new HttpError(503, "Account email is temporarily unavailable. Try again later or contact support.");
    const response = await getAuth().handler(request);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) { return failure(e); }
}
export const GET = handle;
export const POST = handle;

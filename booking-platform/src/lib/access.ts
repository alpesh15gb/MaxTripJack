import "server-only";
import { crmCommandContext } from "./crm-command-context";
import { getAuth } from "./auth";
import { database } from "./db";
import { HttpError } from "./http";
import { requestLimit } from "./request-limit";

export async function principal(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "Sign in to continue.");
  if (!session.user.emailVerified) throw new HttpError(403, "Verify your email before continuing.");
  await requestLimit(session.user.id,"api",240);
  const result = await database().query<{ company_id: string | null; active: boolean }>("SELECT company_id, active FROM customer_accounts WHERE user_id=$1", [session.user.id]);
  const account = result.rows[0];
  if (account && !account.active) throw new HttpError(403, "Account access is suspended.");
  if (account?.company_id) {
    const company = await database().query("SELECT id FROM companies WHERE id=$1 AND status='APPROVED'", [account.company_id]);
    if (!company.rowCount) throw new HttpError(403, "Company account is not approved.");
    if (!session.user.twoFactorEnabled) throw new HttpError(403, "Enable two-factor authentication for corporate access.");
  }
  return { userId: session.user.id, companyId: account?.company_id ?? null, session };
}
export async function administrator(request: Request, permission: string) {
  const delegated=crmCommandContext.getStore();
  if(delegated){if(delegated.permission!==permission)throw new HttpError(403,"Command permission mismatch.");const grant=await database().query('SELECT g.permissions FROM admin_grants g JOIN "user" u ON u.id=g.user_id WHERE g.user_id=$1 AND g.active=true AND u."emailVerified"=true AND u."twoFactorEnabled"=true',[delegated.userId]);if(!grant.rows[0]?.permissions.includes(permission))throw new HttpError(403,"Mapped grant is no longer active.");return {userId:delegated.userId,companyId:null};}
  const actor = await principal(request);
  if (!actor.session.user.twoFactorEnabled) throw new HttpError(403, "Admin access requires two-factor authentication.");
  const result = await database().query<{ permissions: string[] }>("SELECT permissions FROM admin_grants WHERE user_id=$1 AND active=true", [actor.userId]);
  if (!result.rows[0]?.permissions.includes(permission)) throw new HttpError(403, "You do not have permission for this action.");
  return actor;
}

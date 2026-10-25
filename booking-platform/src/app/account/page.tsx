import AccountPanel from "@/components/account-panel";
import { safeAccountReturn } from "@/lib/account-return";
export default async function AccountPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams;
 return <AccountPanel key={`${safeAccountReturn(params.returnTo)}:${params.mode==="reset"?"reset":"signin"}`} initialMode={params.mode==="reset"?"reset":"signin"} returnTo={safeAccountReturn(params.returnTo)} verificationError={typeof params.error === "string" && Boolean(params.error)}/>;
}

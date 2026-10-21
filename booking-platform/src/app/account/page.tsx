import AccountPanel from "@/components/account-panel";
import { safeAccountReturn } from "@/lib/account-return";
export default async function AccountPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams;
 return <AccountPanel returnTo={safeAccountReturn(params.returnTo)} verificationError={typeof params.error === "string" && Boolean(params.error)}/>;
}

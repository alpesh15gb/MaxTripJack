import ResetPasswordPanel from "@/components/reset-password-panel";
import { safeAccountReturn } from "@/lib/account-return";
export default async function ResetPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams;
 const token=typeof params.token==="string"&&!params.error?params.token:"";
 return <ResetPasswordPanel key={token} token={token} returnTo={safeAccountReturn(params.returnTo)}/>;
}

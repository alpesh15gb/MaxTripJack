/** Never persist authenticator material; this key records only an unresolved action. */
export const mfaActionKey=(userId:string)=>`maxtravel.pending-mfa.v1:${encodeURIComponent(userId)}`;
export class MfaActionRejected extends Error {}
type Result={data?:unknown;error?:{status?:number;message?:string}|null};
export async function confirmMfaAction<T extends Result>(work:Promise<T>,kind:'enable'|'verify',timeoutMs=15_000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Authenticator action outcome unknown')),timeoutMs);})]);
  if(result.error){if(result.error.status&&result.error.status>=400&&result.error.status<500)throw new MfaActionRejected(result.error.message||'Authenticator request was not accepted.');throw Error('Authenticator action outcome unknown');}
  const value=result.data;
  if(!value||typeof value!=='object')throw Error('Authenticator response could not be verified');
  if(kind==='enable'){
   if(!('totpURI' in value)||typeof value.totpURI!=='string'||!value.totpURI.startsWith('otpauth://totp/')||!('backupCodes' in value)||!Array.isArray(value.backupCodes)||!value.backupCodes.length||!value.backupCodes.every(code=>typeof code==='string'&&Boolean(code)))throw Error('Authenticator response could not be verified');
  }else if(!('user' in value)||!value.user||typeof value.user!=='object'||!('id' in value.user)||typeof value.user.id!=='string')throw Error('Authenticator response could not be verified');
  return result;
 }finally{clearTimeout(timer);}
}

import 'server-only';
import {createHash,createPrivateKey,createPublicKey} from 'node:crypto';
import {CompactSign,CompactEncrypt} from 'jose';
import {HttpError} from '../http';
import {payGlocalConfig,type PayGlocalConfig} from './payglocal-config';
import {PAYGLOCAL_UAT_ORIGIN,formatPayGlocalAmount,type PayGlocalAttempt,type PayGlocalVerifiedStatus,validatePayGlocalUrl} from './payglocal';

// Protocol: PayGlocal's official JS client at 5f6a93d, plus the current
// credential-management and payment/status API references. exp is the vendor's
// millisecond duration, not a standard JWT NumericDate. Never trust callback JWTs.
export async function payGlocalJws(body:string,config:PayGlocalConfig,now=Date.now()){
 const digest={digest:createHash('sha256').update(body).digest('base64'),digestAlgorithm:'SHA-256',exp:300000,iat:String(now)};
 return new CompactSign(new TextEncoder().encode(JSON.stringify(digest))).setProtectedHeader({alg:'RS256',kid:config.privateKid,'x-gl-merchantId':config.merchantId,'issued-by':config.merchantId,'is-digested':'true','x-gl-enc':'true'}).sign(createPrivateKey(config.privateKey));
}
export async function payGlocalJwe(payload:unknown,config:PayGlocalConfig,now=Date.now()){
 return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload))).setProtectedHeader({alg:'RSA-OAEP-256',enc:'A128CBC-HS256',kid:config.publicKid,'issued-by':config.merchantId,exp:300000,iat:String(now)}).encrypt(createPublicKey(config.publicKey));
}
export type PayGlocalFetch=typeof fetch;
export async function payGlocalRequest(path:string,payload?:unknown,config=payGlocalConfig(),fetcher:PayGlocalFetch=fetch):Promise<Record<string,unknown>>{
 if(!/^\/gl\/v1\/payments\/(?:initiate\/paycollect|[A-Za-z0-9_-]{1,128}\/(?:status|refund))$/.test(path))throw new HttpError(400,'Unsupported payment operation.');
 const body=payload===undefined?'':await payGlocalJwe(payload,config),token=await payGlocalJws(body,config);
 try{
  const response=await fetcher(PAYGLOCAL_UAT_ORIGIN+path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-gl-token-external':token,'x-gl-merchantid':config.merchantId,'x-gl-kid':config.privateKid},...(payload===undefined?{}:{body}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
  // Bound bytes before parsing; responses/tokens/payment data are never logged.
  const reader=response.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576){await reader.cancel();throw Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!response.ok||!result||typeof result!=='object'||Array.isArray(result)||(result.errors&&(!Array.isArray(result.errors)||result.errors.length)))throw Error();return result;
 }catch{throw new HttpError(502,'Payment outcome could not be confirmed. Check My trips before trying again.');}
}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function amount(value:unknown){if(typeof value!=='string'||!/^\d{1,14}(?:\.\d{1,2})?$/.test(value))throw new HttpError(409,'Payment amount requires reconciliation.');const[w,f='']=value.split('.');return BigInt(w)*BigInt(100)+BigInt(f.padEnd(2,'0'));}
export function normalizePayGlocalStatus(raw:Record<string,unknown>,attempt:PayGlocalAttempt,config:Pick<PayGlocalConfig,'merchantId'>):PayGlocalVerifiedStatus{
 const data=object(raw.data),gid=data.gid??raw.gid;
 const amounts=[data.Amount,data.totalAmount,data.upiTxnAmount].filter(v=>v!==undefined),currencies=[data.txnCurrency,data.Currency,data.upiTxnCurrency].filter(v=>v!==undefined);
 if(!amounts.length||!currencies.length||gid!==attempt.gid||data.merchantTxnId!==attempt.merchantTxnId||config.merchantId!==attempt.merchantId||(data.merchantId!==undefined&&data.merchantId!==config.merchantId)||amounts.some(v=>amount(v)!==BigInt(attempt.amountMinor))||currencies.some(v=>v!==attempt.currency)||typeof raw.status!=='string'||(data.status!==undefined&&data.status!==raw.status))throw new HttpError(409,'Payment identity or amount requires reconciliation.');
 const methods:Record<string,string>={CARD:'card',UPI_INTENT:'upi',INB:'netbanking'},method=typeof data['payment-method']==='string'?methods[data['payment-method']]:undefined;
 return {source:'SERVER_STATUS',gid:String(gid),merchantTxnId:attempt.merchantTxnId,merchantId:config.merchantId,totalAmount:formatPayGlocalAmount(attempt.amountMinor),txnCurrency:attempt.currency,status:raw.status,...(method?{method}:{})};
}
export async function initiatePayGlocal(payload:unknown,attempt:PayGlocalAttempt,config=payGlocalConfig()){
 const raw=await payGlocalRequest('/gl/v1/payments/initiate/paycollect',payload,config),data=object(raw.data);
 if(typeof raw.gid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(raw.gid)||data.merchantTxnId!==attempt.merchantTxnId||!['INPROGRESS','INITIATED'].includes(String(raw.status)))throw new HttpError(409,'Payment initiation requires reconciliation.');
 return {...attempt,gid:raw.gid,totalAmount:formatPayGlocalAmount(attempt.amountMinor),txnCurrency:attempt.currency,redirectUrl:validatePayGlocalUrl(data.redirectUrl,'redirect'),statusUrl:validatePayGlocalUrl(data.statusUrl,'status',raw.gid)};
}
export async function readPayGlocalStatus(attempt:PayGlocalAttempt,config=payGlocalConfig()){
 const reference=attempt.gid??attempt.merchantTxnId;
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(reference))throw new HttpError(409,'Payment reference needs reconciliation.');
 const raw=await payGlocalRequest(`/gl/v1/payments/${reference}/status`,undefined,config);
 // The status API supports merchantTxnId after a lost initiate response.
 // Only this authenticated lookup may recover the original payment gid.
 const gid=attempt.gid??object(raw.data).gid;
 if(typeof gid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(gid))throw new HttpError(409,'Payment reference needs reconciliation.');
 return normalizePayGlocalStatus(raw,{...attempt,gid},config);
}

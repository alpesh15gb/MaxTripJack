import {createPrivateKey,createPublicKey} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {HttpError} from '../http';
import {configuredAuthBaseURL} from '../auth-origin';
export type PayGlocalConfig={merchantId:string;privateKid:string;publicKid:string;privateKey:string;publicKey:string;origin:string};
export function payGlocalConfig(env:Record<string,string|undefined>=process.env):PayGlocalConfig{
 const unavailable=()=>new HttpError(503,'Online payment is not available yet. No payment was initiated.');
 if(env.PAYGLOCAL_ENV!=='UAT')throw unavailable();
 const merchantId=env.PAYGLOCAL_MERCHANT_ID,privateKid=env.PAYGLOCAL_PRIVATE_KEY_ID,publicKid=env.PAYGLOCAL_PUBLIC_KEY_ID,origin=configuredAuthBaseURL(env);
 if(!merchantId||!privateKid||!publicKid||![merchantId,privateKid,publicKid].every(v=>/^[A-Za-z0-9_-]{1,200}$/.test(v))||!origin)throw unavailable();
 let app:URL;try{app=new URL(origin);}catch{throw unavailable();}if(app.protocol!=='https:'||app.username||app.password)throw unavailable();
 function pem(inline:string|undefined,file:string|undefined){let value=inline;if(!value&&file)value=readFileSync(file,'utf8');if(!value||value.length>32768)throw unavailable();return value.replaceAll('\\n','\n');}
 try{
  const privateKey=createPrivateKey(pem(env.PAYGLOCAL_PRIVATE_KEY,env.PAYGLOCAL_PRIVATE_KEY_PATH));
  const publicKey=createPublicKey(pem(env.PAYGLOCAL_PUBLIC_KEY,env.PAYGLOCAL_PUBLIC_KEY_PATH));
  if(privateKey.asymmetricKeyType!=='rsa'||publicKey.asymmetricKeyType!=='rsa'||(privateKey.asymmetricKeyDetails?.modulusLength??0)<2048||(publicKey.asymmetricKeyDetails?.modulusLength??0)<2048)throw unavailable();
  return {merchantId,privateKid,publicKid,origin:app.origin,privateKey:privateKey.export({format:'pem',type:'pkcs8'}).toString(),publicKey:publicKey.export({format:'pem',type:'spki'}).toString()};
 }catch{throw unavailable();}
}

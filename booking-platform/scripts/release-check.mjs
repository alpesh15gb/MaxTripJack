import {createPrivateKey,createPublicKey} from 'node:crypto';
import {readFileSync} from 'node:fs';
const provider=process.env.PAYMENT_PROVIDER||"PAYGLOCAL";
const required=["DATABASE_URL","BETTER_AUTH_URL","BETTER_AUTH_SECRET","TRAVELLER_ENCRYPTION_KEY","TRIPJACK_FLIGHT_API_KEY","TRIPJACK_HOTEL_API_KEY","SMTP_HOST","MAIL_FROM","CRM_EVENTS_URL","CRM_SIGNING_KEY","CRM_KEY_ID"];
if(provider==="RAZORPAY")required.push("RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET","RAZORPAY_WEBHOOK_SECRET");
const failures=[];for(const key of required)if(!process.env[key])failures.push(`${key}: missing`);
// Configuration only: merchant UAT interoperability remains a separate gate.
if(provider==="PAYGLOCAL"){
 failures.push("PAYGLOCAL_TRAVEL_CONTRACT: travel mapping is implemented; merchant field, transport and webhook confirmations are pending; new checkout remains blocked");
 if(process.env.PAYGLOCAL_ENV!=='UAT')failures.push('PAYGLOCAL_ENV: only UAT is enabled until merchant approval');
 for(const name of ['PAYGLOCAL_MERCHANT_ID','PAYGLOCAL_PRIVATE_KEY_ID','PAYGLOCAL_PUBLIC_KEY_ID'])if(!/^[A-Za-z0-9_-]{1,200}$/.test(process.env[name]??''))failures.push(`${name}: missing or invalid`);
 try{const pem=name=>{const text=process.env[name]||(process.env[name+'_PATH']?readFileSync(process.env[name+'_PATH'],'utf8'):'');if(!text||text.length>32768)throw Error();return text.replaceAll('\\n','\n');};for(const key of [createPrivateKey(pem('PAYGLOCAL_PRIVATE_KEY')),createPublicKey(pem('PAYGLOCAL_PUBLIC_KEY'))])if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)throw Error();}catch{failures.push('PAYGLOCAL_KEYS: valid RSA private key and gateway public key/certificate are required (minimum 2048 bits)');}
}
else if(provider!=="RAZORPAY")failures.push("PAYMENT_PROVIDER: unsupported value. Select a supported provider configuration; unknown providers cannot pass checkout readiness.");
for(const name of ["BETTER_AUTH_URL","CRM_EVENTS_URL"]){try{const url=new URL(process.env[name]);if(url.protocol!=="https:"||url.username||url.password)failures.push(`${name}: use HTTPS without embedded credentials`);}catch{failures.push(`${name}: invalid URL`);}}
for(const key of ["BETTER_AUTH_SECRET","CRM_SIGNING_KEY",...(provider==="RAZORPAY"?["RAZORPAY_WEBHOOK_SECRET"]:[])])if((process.env[key]?.length??0)<32)failures.push(`${key}: use at least 32 random characters`);
if(!/^[a-f0-9]{64}$/i.test(process.env.TRAVELLER_ENCRYPTION_KEY??""))failures.push("TRAVELLER_ENCRYPTION_KEY: expected 32-byte hex key");
if(provider==="RAZORPAY"&&!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_"))failures.push("RAZORPAY_KEY_ID: only test credentials are enabled until UAT approval");
try{const db=new URL(process.env.DATABASE_URL);if(db.username!=="maxtravel_app")failures.push("DATABASE_URL: production runtime must use the restricted maxtravel_app role");}catch{failures.push("DATABASE_URL: invalid database URL");}
if(process.env.MIGRATION_DATABASE_URL||process.env.RUNTIME_DATABASE_PASSWORD)failures.push("Keep owner/provisioning credentials in .env.migration, outside runtime configuration");
if(process.env.BETTER_AUTH_SECRET&&process.env.BETTER_AUTH_SECRET===process.env.CRM_SIGNING_KEY)failures.push("Use different auth and integration secrets");
if(failures.length){console.error("Checkout configuration readiness checks failed (secret values are never printed):\n"+failures.map(v=>`- ${v}`).join("\n"));process.exitCode=1;}else console.log(`UAT configuration checks passed for ${provider==='PAYGLOCAL'?'PayGlocal':'Razorpay'} test mode. This does not execute provider transactions, certify credentials or establish end-to-end payment readiness. Production launch is not certified; provider UAT and go-live approval remain required.`);

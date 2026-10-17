const required=["DATABASE_URL","BETTER_AUTH_URL","BETTER_AUTH_SECRET","TRAVELLER_ENCRYPTION_KEY","TRIPJACK_FLIGHT_API_KEY","TRIPJACK_HOTEL_API_KEY","RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET","RAZORPAY_WEBHOOK_SECRET","SMTP_HOST","MAIL_FROM","CRM_EVENTS_URL","CRM_SIGNING_KEY","CRM_KEY_ID"];
const failures=[];for(const key of required)if(!process.env[key])failures.push(`${key}: missing`);
for(const name of ["BETTER_AUTH_URL","CRM_EVENTS_URL"]){try{const url=new URL(process.env[name]);if(url.protocol!=="https:"||url.username||url.password)failures.push(`${name}: use HTTPS without embedded credentials`);}catch{failures.push(`${name}: invalid URL`);}}
for(const key of ["BETTER_AUTH_SECRET","CRM_SIGNING_KEY","RAZORPAY_WEBHOOK_SECRET"])if((process.env[key]?.length??0)<32)failures.push(`${key}: use at least 32 random characters`);
if(!/^[a-f0-9]{64}$/i.test(process.env.TRAVELLER_ENCRYPTION_KEY??""))failures.push("TRAVELLER_ENCRYPTION_KEY: expected 32-byte hex key");
if(!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_"))failures.push("RAZORPAY_KEY_ID: only test credentials are enabled until UAT approval");
try{const db=new URL(process.env.DATABASE_URL);if(db.username!=="maxtravel_app")failures.push("DATABASE_URL: production runtime must use the restricted maxtravel_app role");}catch{failures.push("DATABASE_URL: invalid database URL");}
if(process.env.MIGRATION_DATABASE_URL||process.env.RUNTIME_DATABASE_PASSWORD)failures.push("Keep owner/provisioning credentials in .env.migration, outside runtime configuration");
if(process.env.BETTER_AUTH_SECRET&&process.env.BETTER_AUTH_SECRET===process.env.CRM_SIGNING_KEY)failures.push("Use different auth and integration secrets");
if(failures.length){console.error("Configuration requires attention (secret values are never printed):\n"+failures.map(v=>`- ${v}`).join("\n"));process.exitCode=1;}else console.log("Release configuration checks passed. This does not execute provider transactions or certify credentials.");

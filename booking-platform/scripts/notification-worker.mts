import { heartbeat } from "../src/lib/worker-health";
import { randomUUID } from "node:crypto";
import { database } from "../src/lib/db";
import { unseal } from "../src/lib/vault";
import { sendMail,mailReady } from "../src/lib/mail";
if(!mailReady()||!process.env.BETTER_AUTH_URL)throw Error("Configure email delivery and the public application URL.");
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){await heartbeat("notifications");const lease=randomUUID();const result=await database().query("UPDATE customer_notifications SET lease_token=$1,lease_until=now()+interval '90 seconds' WHERE id=(SELECT id FROM customer_notifications WHERE delivered_at IS NULL AND attempts<12 AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",[lease]);const item=result.rows[0];if(!item){await new Promise(resolve=>setTimeout(resolve,2000));continue;}
 try{const result=await database().query("SELECT reference,guests_encrypted FROM orders WHERE id=$1",[item.order_id]);const order=result.rows[0];const guests=unseal(order.guests_encrypted,item.order_id);const status=item.status.replaceAll("_"," ");await sendMail(guests.email,`Max Travel ${order.reference}: ${status}`,`Your booking ${order.reference} has an update: ${status}.\n\nView your latest booking status, documents and cancellation/refund updates:\n${new URL("/my-trips",process.env.BETTER_AUTH_URL).toString()}\n\nSupplier confirmation and customer refund are separate steps. Contact Max Travel if you need help.\n\nMax Travel`);await database().query("UPDATE customer_notifications SET delivered_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",[item.id,lease]);}
 catch{await database().query("UPDATE customer_notifications SET attempts=attempts+1,next_attempt=now()+($3*interval '1 second'),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",[item.id,lease,Math.min(3600,2**Math.min(item.attempts+1,12)*10)]);console.error("Customer notification deferred",{id:item.id});}
}}finally{await database().end();}

import { database } from "../src/lib/db";
import { executeRefund } from "../src/lib/refund-runner";
import { heartbeat } from "../src/lib/worker-health";
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){try{await heartbeat("refunds");const found=await database().query("SELECT r.id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.provider='RAZORPAY' AND r.status='PROCESSING' AND r.next_check<=now() ORDER BY r.next_check LIMIT 10");for(const row of found.rows){if(stopping)break;try{await executeRefund(row.id);}catch{/* The persisted cooldown retains unknown outcomes for a later check. */}}}catch{console.error("Refund reconciliation paused after an internal error.");}await new Promise(resolve=>setTimeout(resolve,5000));}}finally{await database().end();}

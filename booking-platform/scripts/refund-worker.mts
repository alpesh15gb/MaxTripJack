import { database } from "../src/lib/db";
import { executeRefund } from "../src/lib/refund-runner";
import { heartbeat } from "../src/lib/worker-health";
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){try{await heartbeat("refunds");const found=await database().query("SELECT id FROM refunds WHERE status='PROCESSING' AND next_check<=now() ORDER BY next_check LIMIT 10");for(const row of found.rows){if(stopping)break;try{await executeRefund(row.id);}catch{/* The persisted cooldown retains unknown outcomes for a later check. */}}}catch{console.error("Refund reconciliation paused after an internal error.");}await new Promise(resolve=>setTimeout(resolve,5000));}}finally{await database().end();}

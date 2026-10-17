import { database } from "../src/lib/db";
import { heartbeat } from "../src/lib/worker-health";
import { executeCancellation } from "../src/lib/cancellation-runner";
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){try{await heartbeat("cancellations");const result=await database().query("SELECT id FROM cancellation_requests WHERE status='SUPPLIER_PENDING' AND supplier_attempted_at IS NOT NULL AND (next_check IS NULL OR next_check<=now()) AND poll_attempts<5 ORDER BY next_check NULLS FIRST LIMIT 10");for(const row of result.rows){if(stopping)break;try{await executeCancellation(row.id,null,false);}catch{/* Persisted cooldown prevents a concurrent/repeated supplier submission. */}}}catch{console.error("Cancellation status checks deferred.");}await new Promise(resolve=>setTimeout(resolve,5000));}}finally{await database().end();}

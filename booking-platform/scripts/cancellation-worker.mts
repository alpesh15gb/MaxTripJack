import { database } from "../src/lib/db";
import { heartbeat } from "../src/lib/worker-health";
import { runCancellationJobs } from "../src/lib/cancellation-runner";
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){try{await heartbeat("cancellations");await runCancellationJobs(()=>heartbeat("cancellations"));}catch{console.error("Cancellation status checks deferred.");}await new Promise(resolve=>setTimeout(resolve,5000));}}finally{await database().end();}

import { database } from "../src/lib/db";
import { heartbeat } from "../src/lib/worker-health";
import { maintainTransientData } from "../src/lib/maintenance";
let stopping=false,lastRun=0;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){try{await heartbeat("maintenance");if(Date.now()-lastRun>86400000){const result=await maintainTransientData();lastRun=Date.now();console.log("Transient data maintenance completed",result);}}catch{console.error("Transient maintenance deferred.");}await new Promise(resolve=>setTimeout(resolve,30000));}}finally{await database().end();}

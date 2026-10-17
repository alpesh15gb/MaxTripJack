import { heartbeat } from "../src/lib/worker-health";
import { runBookingJob } from "../src/lib/booking-runner";
import { database } from "../src/lib/db";
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
try{while(!stopping){try{await heartbeat("bookings");await runBookingJob();}catch{console.error("Booking worker paused after an internal error.");}await new Promise(r=>setTimeout(r,2000));}}finally{await database().end();}

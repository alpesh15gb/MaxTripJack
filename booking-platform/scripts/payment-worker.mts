import {database} from '../src/lib/db';
import {heartbeat} from '../src/lib/worker-health';
import {runPayGlocalPaymentJob} from '../src/lib/payglocal-runtime';
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
try{while(!stopping){try{await heartbeat('payments');await runPayGlocalPaymentJob();}catch{console.error('Payment status reconciliation deferred; no new payment was initiated.');}await new Promise(resolve=>setTimeout(resolve,5000));}}finally{await database().end();}

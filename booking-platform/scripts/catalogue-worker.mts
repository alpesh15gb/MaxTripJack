import {spawn, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {database} from '../src/lib/db';
import {catalogueEnvironment} from '../src/lib/hotel-catalogue';

// Opt-in Compose profile. Only reads supplier content/search evidence and writes
// booking-owned catalogues. It never runs booking, payment, notification or CRM jobs.
let stopping = false;
let child: ChildProcess | undefined;
let wake: (()=>void) | undefined;
for (const signal of ['SIGTERM','SIGINT'] as const) process.on(signal,()=>{
  stopping = true;
  wake?.();
  child?.kill('SIGTERM');
});

function run(name:'sync-flight-routes'|'sync-hotel-catalogue',args:string[] = []) {
  return new Promise<boolean>(resolve=>{
    if (stopping) return resolve(false);
    const script=fileURLToPath(new URL(`${name}.mjs`,import.meta.url));
    child=spawn(process.execPath,['--conditions=react-server','--import','./scripts/standalone-server.mjs',script,...args],{stdio:['ignore','inherit','inherit']});
    const current=child;
    // Restartable checkpoints make this bound safe even for a slow supplier.
    const deadline=setTimeout(()=>current.kill('SIGTERM'),8*60_000);
    const hardDeadline=setTimeout(()=>current.kill('SIGKILL'),8*60_000+10_000);
    const done=(success:boolean)=>{clearTimeout(deadline);clearTimeout(hardDeadline);if(child===current)child=undefined;resolve(success);};
    current.once('error',()=>done(false));
    current.once('exit',(code)=>done(code===0));
  });
}
async function pause(ms:number) {
  if(stopping)return;
  await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wake=undefined;resolve();},ms);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});
}

try {
  const environment=catalogueEnvironment();
  console.log('Search catalogue worker started',{environment,intervalSeconds:300});
  while(!stopping) {
    const routesOk=await run('sync-flight-routes');
    if(stopping)break;
    let refresh=false;
    try {
      const result=await database().query<{refresh:boolean}>("SELECT completed_at < now()-interval '7 days' AS refresh FROM hotel_catalogue_sync WHERE environment=$1",[environment]);
      refresh=result.rows[0]?.refresh===true;
    } catch { console.warn('Hotel catalogue schema is unavailable; run booking migrations before enabling this worker.'); }
    const hotelsOk=await run('sync-hotel-catalogue',['--max-pages=2',...(refresh?['--refresh']:[])]);
    console.log('Search catalogue cycle finished',{routesOk,hotelsOk,refresh});
    await pause(routesOk&&hotelsOk?300_000:900_000);
  }
} catch { console.error('Search catalogue worker configuration is unavailable. Check booking catalogue configuration.');process.exitCode=1; }
finally {
  child?.kill('SIGTERM');
  try { await database().end(); } catch { /* Missing configuration was reported above; never print raw connection errors. */ }
}

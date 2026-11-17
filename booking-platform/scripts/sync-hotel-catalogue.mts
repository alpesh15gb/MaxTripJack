import {Pool,type PoolClient} from 'pg';
import {catalogueEnvironment} from '../src/lib/hotel-catalogue';
import {createHotelCatalogueRepository} from '../src/lib/hotel-catalogue-repository';
import {createHotelCatalogueClient,HotelCatalogueSupplierError} from '../src/lib/hotel-catalogue-client';
import {syncHotelCatalogue} from '../src/lib/hotel-catalogue-sync';

const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--refresh'&&arg!=='--retry-pending'&&!/^--max-pages=\d{1,3}$/.test(arg)) || args.filter(arg=>arg.startsWith('--max-pages=')).length>1){
  console.error('Usage: sync-hotel-catalogue [--max-pages=2] [--refresh] [--retry-pending]');process.exit(1);
}
const maxPages=Number(args.find(arg=>arg.startsWith('--max-pages='))?.split('=')[1]??2);
if(!Number.isInteger(maxPages)||maxPages<1||maxPages>100){console.error('Choose --max-pages from 1 to 100.');process.exit(1);}
if(!process.env.DATABASE_URL){console.error('Booking DATABASE_URL is required.');process.exit(1);}
let environment:'uat'|'production';
try{environment=catalogueEnvironment();}catch{console.error('Hotel catalogue environment is invalid or not approved.');process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10_000,statement_timeout:20_000});
let connection:PoolClient|undefined;
let locked=false;
try{
  connection=await pool.connect();
  const lock=await connection.query("SELECT pg_try_advisory_lock(71266302,hashtext($1)) AS acquired",[environment]);
  locked=lock.rows[0]?.acquired===true;
  if(!locked){console.log('Another hotel catalogue import is running; no work performed.');}
  else{
    const client=connection;
    const repository=createHotelCatalogueRepository((sql,values)=>client.query(sql,values),environment);
    const supplier=createHotelCatalogueClient();
    const result=await syncHotelCatalogue({repository,client:supplier,environment,maxPages,refresh:args.includes('--refresh'),
      atomic:async work=>{await client.query('BEGIN');try{const value=await work();await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}},
      progress:event=>console.log('Hotel catalogue progress',event),
    });
    console.log('Hotel catalogue run finished',{environment,pages:result.pages,retryBatches:result.retryBatches,mappingComplete:result.mappingComplete,
      countries:result.stats.countriesTotal,countriesCompleted:result.stats.countriesCompleted,knownHotels:result.stats.mappedHotels,
      storedHotels:result.stats.total,unresolvedContent:result.stats.missingContent,indexableHotels:result.stats.indexableTotal});
  }
}catch(error){
  const code=error instanceof HotelCatalogueSupplierError?error.code:'IMPORT_FAILED';
  if(connection&&locked)await connection.query('UPDATE hotel_catalogue_sync SET last_error_code=$2,updated_at=now() WHERE environment=$1',[environment,code]).catch(()=>undefined);
  console.error('Hotel catalogue import paused; rerun to resume.',{code,...(error instanceof HotelCatalogueSupplierError&&error.httpStatus?{httpStatus:error.httpStatus}:{})});
  process.exitCode=1;
}finally{
  if(connection){if(locked)await connection.query('SELECT pg_advisory_unlock(71266302,hashtext($1))',[environment]).catch(()=>undefined);connection.release();}
  await pool.end();
}

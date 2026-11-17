import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {migrationDatabaseURL} from './migrate-checkout-identity.mjs';

try {
  const env={...process.env,MIGRATION_DATABASE_URL:migrationDatabaseURL(process.env)};
  delete env.POSTGRES_PASSWORD;delete env.POSTGRES_USER;
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./migrate.mjs',import.meta.url))],{env,stdio:'ignore',windowsHide:true,timeout:300_000});
  if(result.error||result.status!==0)throw Error('Migration did not complete.');
  console.log('Booking schema and search catalogue migrations are up to date.');
} catch {
  console.error('Booking catalogue migration failed. Deployment stopped; check owner database access. Secret values are not logged.');
  process.exitCode=1;
}

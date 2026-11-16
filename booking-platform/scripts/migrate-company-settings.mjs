import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {migrationDatabaseURL} from './migrate-checkout-identity.mjs';
try {
 const env={...process.env,MIGRATION_DATABASE_URL:migrationDatabaseURL(process.env)};
 delete env.POSTGRES_PASSWORD;delete env.POSTGRES_USER;
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./migrate.mjs',import.meta.url))],{env,stdio:'inherit'});
 process.exitCode=result.status??1;
}catch{console.error('Company settings migration failed. Check owner database credentials; secret values are not logged.');process.exitCode=1;}

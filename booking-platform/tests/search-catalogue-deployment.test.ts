import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {bookingMigrations,migrateBookingSchema} from '../scripts/migrate.mjs';

const connection = 'postgresql://synthetic-owner:private-secret@not-used.invalid/booking';

test('booking migrations preserve one transaction and apply only pending catalogue migrations', async()=>{
  const statements:string[]=[];const loaded:string[]=[];const reports:string[]=[];let released=false;let ended=false;
  const exit=await migrateBookingSchema({environment:{MIGRATION_DATABASE_URL:connection},
    createPool(value){assert.equal(value,connection);return {
      async connect(){return {async query(sql:string,values?:string[]){statements.push(sql);
        return {rowCount:sql.startsWith('SELECT name') && Number(values?.[0]?.slice(0,3))<26?1:0};
      },release(){released=true;}};},async end(){ended=true;},
    };},async readMigration(name){loaded.push(name);return `-- synthetic ${name}`;},
    report:message=>reports.push(message),reportError:message=>reports.push(message),
  });
  assert.equal(exit,0);assert.deepEqual(loaded,['026-hotel-catalogue','027-flight-route-catalogue','028-hotel-catalogue-priority','029-hotel-catalogue-search']);
  assert.equal(statements[0],'BEGIN');assert.equal(statements[1],'SELECT pg_advisory_xact_lock(71266301)');
  assert.equal(statements.at(-1),'COMMIT');assert.equal(statements.filter(s=>s.startsWith('INSERT INTO schema_migrations')).length,4);
  assert.equal(released,true);assert.equal(ended,true);assert.doesNotMatch(reports.join('\n'),/private-secret|synthetic-owner|postgresql/);
  assert.equal(new Set(bookingMigrations).size,bookingMigrations.length);
});

for(const failure of ['construction','connection','statement','rollback','cleanup'] as const) test(`migration ${failure} failure is sanitized and returns nonzero`,async()=>{
  const reports:string[]=[];const statements:string[]=[];let ended=false;let released=false;
  const exit=await migrateBookingSchema({environment:{DATABASE_URL:connection},createPool(){
    if(failure==='construction')throw Error(connection);
    return {async connect(){
      if(failure==='connection')throw Error(connection);
      return {async query(sql:string){statements.push(sql);
        if((failure==='statement'||failure==='rollback')&&sql.startsWith('SELECT pg_'))throw Error(connection);
        if(failure==='rollback'&&sql==='ROLLBACK')throw Error(connection);
        return {rowCount:1};},release(){released=true;}};
    },async end(){ended=true;if(failure==='cleanup')throw Error(connection);}};
  },async readMigration(){throw Error('Already-applied SQL must not be read.');},report:message=>reports.push(message),reportError:message=>reports.push(message)});
  assert.equal(exit,1);assert.doesNotMatch(reports.join('\n'),/private-secret|synthetic-owner|postgresql|Error:/);
  if(failure!=='construction')assert.equal(ended,true);
  if(failure==='statement'||failure==='rollback'){assert.equal(released,true);assert.equal(statements.at(-1),'ROLLBACK');assert.ok(!statements.includes('COMMIT'));}
});

test('catalogue migration wrapper rejects invalid owner configuration without leaking values or connecting',()=>{
  const result=spawnSync(process.execPath,['scripts/migrate-search-catalogues.mjs'],{cwd:process.cwd(),encoding:'utf8',timeout:15_000,
    env:{...process.env,DATABASE_URL:connection,MIGRATION_DATABASE_URL:'invalid-private-secret',POSTGRES_USER:'synthetic-owner',POSTGRES_PASSWORD:'private-secret'},
  });
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  assert.match(result.stderr,/migration failed/);assert.doesNotMatch(result.stdout+result.stderr,/private-secret|synthetic-owner|postgresql|Error:/);
});

test('direct booking migration rejects missing configuration without an uncaught stack',()=>{
  const result=spawnSync(process.execPath,['scripts/migrate.mjs'],{cwd:process.cwd(),encoding:'utf8',timeout:15_000,
    env:{...process.env,DATABASE_URL:'',MIGRATION_DATABASE_URL:''},
  });
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  assert.match(result.stderr,/Migration did not complete/);assert.doesNotMatch(result.stdout+result.stderr,/Error:|at migrateBookingSchema/);
});

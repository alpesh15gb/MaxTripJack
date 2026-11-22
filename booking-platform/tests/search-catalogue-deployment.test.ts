import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {bookingMigrations,migrateBookingSchema} from '../scripts/migrate.mjs';

const connection = 'postgresql://synthetic-owner:private-secret@not-used.invalid/booking';

test('booking migrations preserve one transaction and apply only pending migrations', async()=>{
  const statements:string[]=[];const loaded:string[]=[];const reports:string[]=[];let released=false;let ended=false;
  const exit=await migrateBookingSchema({environment:{MIGRATION_DATABASE_URL:connection},
    createPool(value){assert.equal(value,connection);return {
      async connect(){return {async query(sql:string,values?:string[]){statements.push(sql);
        return {rowCount:sql.startsWith('SELECT name') && Number(values?.[0]?.slice(0,3))<26?1:0};
      },release(){released=true;}};},async end(){ended=true;},
    };},async readMigration(name){loaded.push(name);return `-- synthetic ${name}`;},
    report:message=>reports.push(message),reportError:message=>reports.push(message),
  });
  assert.equal(exit,0);assert.deepEqual(loaded,['026-hotel-catalogue','027-flight-route-catalogue','028-hotel-catalogue-priority','029-hotel-catalogue-search','030-flight-fare-calendar','031-guest-checkout','032-flight-fare-calendar-verified','033-office-enquiries']);
  assert.equal(statements[0],'BEGIN');assert.equal(statements[1],'SELECT pg_advisory_xact_lock(71266301)');
  assert.equal(statements.at(-1),'COMMIT');assert.equal(statements.filter(s=>s.startsWith('INSERT INTO schema_migrations')).length,8);
  assert.equal(released,true);assert.equal(ended,true);assert.doesNotMatch(reports.join('\n'),/private-secret|synthetic-owner|postgresql/);
  assert.equal(new Set(bookingMigrations).size,bookingMigrations.length);
});

test('verified fare migration excludes legacy prices and allows the runtime role to store exact checks',async()=>{
  const db=new PGlite();
  const migration=(name:string)=>readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8');
  try{
    await db.exec('CREATE ROLE maxtravel_app');
    await db.exec(await migration('030-flight-fare-calendar'));
    await db.exec(`INSERT INTO flight_fare_calendar
      (origin_code,destination_code,cabin,departure_date,lowest_adult_minor,provider_environment)
      VALUES ('BOM','DEL','ECONOMY','2026-12-01',374100,'uat')`);
    await db.exec(await migration('032-flight-fare-calendar-verified'));
    await db.exec('SET ROLE maxtravel_app');
    assert.deepEqual((await db.query('SELECT lowest_adult_minor FROM flight_fare_calendar_verified')).rows,[]);
    const insert=`INSERT INTO flight_fare_calendar_verified
      (origin_code,destination_code,cabin,departure_date,lowest_adult_minor,provider_environment)
      VALUES ('BOM','DEL','ECONOMY',$1::date,$2,'uat')`;
    await db.query(insert,['2026-12-01',326800]);
    await db.query(insert,['2026-12-02',null]);
    await assert.rejects(db.query(insert,['2026-12-03',0]),/check constraint/);
    await db.exec("UPDATE flight_fare_calendar_verified SET lowest_adult_minor=381200 WHERE departure_date='2026-12-01'");
    const result=await db.query('SELECT lowest_adult_minor::integer AS minor FROM flight_fare_calendar_verified ORDER BY departure_date');
    assert.deepEqual(result.rows,[{minor:381200},{minor:null}]);
  }finally{await db.close();}
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

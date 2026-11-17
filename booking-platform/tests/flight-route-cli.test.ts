import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Replace only the child process's pg module. No database/network connection is made.
const preload=`import {createRequire} from 'node:module';
const pg=createRequire(process.cwd()+'/package.json')('pg');
const failure=process.env.CLI_TEST_FAILURE;
const fail=()=>{throw Error('SECRET_DATABASE_URL_password_in_raw_error');};
pg.Pool=class {
 constructor(){if(failure==='construct')fail();}
 on(){return this;}
 async connect(){if(failure==='connect')fail();return {
  async query(sql){
   if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:failure!=='busy'}]};
   if(sql.includes('pg_advisory_unlock')){if(failure==='busy')console.log('UNEXPECTED_UNLOCK');if(failure==='unlock')fail();}
   if(failure==='query'&&(sql.includes('INSERT')||sql==='ROLLBACK'))fail();
   return {rows:[],rowCount:0};
  },release(){if(failure==='release')fail();}
 };}
 async end(){if(failure==='end')fail();}
};`;
const bootstrap=`data:text/javascript,${encodeURIComponent(preload)}`;

function run(script:string,args:string[],failure='') {
  const result=spawnSync(process.execPath,['--conditions=react-server','--import','./scripts/standalone-server.mjs','--import',bootstrap,'--import','tsx',`scripts/${script}.mts`,...args],{
    cwd:process.cwd(),encoding:'utf8',timeout:15_000,
    env:{...process.env,DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/isolated_fixture',CLI_TEST_FAILURE:failure},
  });
  assert.equal(result.error,undefined);
  const output=result.stdout+result.stderr;
  assert.doesNotMatch(output,/SECRET_DATABASE_URL|password_in_raw_error|UNEXPECTED_UNLOCK|\n\s+at /,'Operational logs must not expose raw errors or release a lock that was not acquired');
  return {...result,output};
}

test('route discovery sanitizes startup, failed rollback and cleanup errors',()=>{
  for(const failure of ['construct','connect','busy','query','unlock','release','end']) {
    const result=run('sync-flight-routes',[],failure);
    assert.equal(result.status,1,`${failure} must fail without a raw stack trace`);
    assert.match(result.output,/Flight route discovery/);
  }
  assert.equal(run('sync-flight-routes',['--unknown']).status,1);
  assert.equal(run('sync-flight-routes',[]).status,0);
});

test('route import sanitizes file, database and cleanup failures while preserving validation mode',()=>{
  const directory=mkdtempSync(join(tmpdir(),'maxtravel-route-cli-')),file=join(directory,'route.jsonl');
  try {
    writeFileSync(file,JSON.stringify({from:'LKO',to:'BLR',sourceUrl:'https://www.tripjack.com/nav/api',verifiedAt:new Date().toISOString(),environment:'production',notes:'Synthetic route record for isolated command testing. Compare the selected airports and travel dates before requesting any current fare or availability.'})+'\n');
    for(const failure of ['construct','connect','busy','query','unlock','release','end']) {
      const result=run('import-flight-routes',['--file',file,'--apply'],failure);
      assert.equal(result.status,1,`${failure} must fail without a raw stack trace`);
      assert.match(result.output,/Flight route import/);
    }
    assert.equal(run('import-flight-routes',['--file',join(directory,'missing.jsonl')]).status,1);
    assert.equal(run('import-flight-routes',['--file','--apply']).status,1);
    // Validation must not construct a pool even when construction would fail.
    assert.equal(run('import-flight-routes',['--file',file],'construct').status,0);
    assert.equal(run('import-flight-routes',['--file',file,'--apply']).status,0);
  } finally {unlinkSync(file);rmdirSync(directory);}
});

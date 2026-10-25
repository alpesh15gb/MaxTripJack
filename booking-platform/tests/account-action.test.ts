import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountActionRejected, confirmAccountAction } from '../src/lib/account-action';

test('account mutations distinguish confirmed, explicitly rejected and unknown outcomes', async () => {
  assert.deepEqual(await confirmAccountAction(Promise.resolve({data:{status:true},error:null})), {data:{status:true},error:null});
  for(const data of [undefined,null,{}, {status:false}, {status:'true'}]) await assert.rejects(confirmAccountAction(Promise.resolve({data,error:null})), /outcome unknown/);
  await assert.rejects(confirmAccountAction(Promise.resolve({error:{status:400,message:'Expired reset link'}})), AccountActionRejected);
  for (const status of [0, 500, 503]) await assert.rejects(confirmAccountAction(Promise.resolve({error:{status}})), error => error instanceof Error && !(error instanceof AccountActionRejected));
  await assert.rejects(confirmAccountAction(Promise.reject(new Error('Lost response'))), /Lost response/);
});
test('an overdue account action settles as unknown and a late success cannot convert it into success', async () => {
  let resolve!: (value:{data:{status:true};error:null}) => void;
  const result = confirmAccountAction(new Promise<{data:{status:true};error:null}>(done => {resolve=done;}), 5);
  await assert.rejects(result, /outcome unknown/);
  resolve({data:{status:true},error:null});
  await assert.rejects(result, /outcome unknown/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmMfaAction,MfaActionRejected,mfaActionKey} from '../src/lib/mfa-action';
test('MFA accepts only complete endpoint contracts',async()=>{
 await confirmMfaAction(Promise.resolve({data:{totpURI:'otpauth://totp/Fixture?secret=SYNTHETIC',backupCodes:['synthetic-only']}}),'enable');
 await confirmMfaAction(Promise.resolve({data:{user:{id:'fixture'},token:null}}),'verify');
 for(const data of [null,{}, {totpURI:'https://invalid',backupCodes:['x']},{totpURI:'otpauth://totp/x',backupCodes:[]}])await assert.rejects(confirmMfaAction(Promise.resolve({data}),'enable'));
 await assert.rejects(confirmMfaAction(Promise.resolve({data:{status:true}}),'verify'));
});
test('MFA distinguishes definite rejection from unknown mutation and bounds waiting',async()=>{
 await assert.rejects(confirmMfaAction(Promise.resolve({error:{status:400,message:'Invalid code'}}),'verify'),MfaActionRejected);
 await assert.rejects(confirmMfaAction(Promise.resolve({error:{status:503}}),'verify'),error=>!(error instanceof MfaActionRejected));
 await assert.rejects(confirmMfaAction(new Promise(()=>{}),'enable',5),/unknown/);
 assert.equal(mfaActionKey('user/a'),'maxtravel.pending-mfa.v1:user%2Fa');
});

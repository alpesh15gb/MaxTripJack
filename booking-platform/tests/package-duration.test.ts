import test from 'node:test';
import assert from 'node:assert/strict';
import {packageDurationLabel} from '../src/lib/package-duration';
for(const unit of ['day','night'] as const){
 test(`package ${unit} copy handles zero, singular and multiple`,()=>{
  for(const count of [0,1,2,60])assert.equal(packageDurationLabel(count,unit),`${count} ${unit}${count===1?'':'s'}`);
 });
}

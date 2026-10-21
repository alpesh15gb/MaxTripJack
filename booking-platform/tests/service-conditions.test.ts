import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceConditions } from '../src/lib/service-conditions';
test('supplier restrictions are preserved as readable labelled values without invented code meanings',()=>{
 const output=serviceConditions({conditions:{st:180,unknownCode:false,restriction:{text:'No refunds after departure',charge:1200}},alerts:['Only eligible adults may select exit rows']});
 assert.equal(output.blocked,false);
 assert.deepEqual(output.lines.map(line=>line.text),['180','No','No refunds after departure','1200','Only eligible adults may select exit rows']);
 assert.match(output.lines[0].label,/validity \(seconds\)/);
 assert.match(output.lines[1].label,/Supplier field “unknownCode”/);
 assert.equal(serviceConditions({conditions:{},alerts:[]}).blocked,false);
});
test('sensitive fields and unrenderable or unexpected terms block acceptance without disclosing values',()=>{
 const output=serviceConditions({conditions:{apiKey:'must-not-display',passportNumber:'private',rule:'Non-refundable'},alerts:[]});
 assert.equal(output.blocked,true);
 assert.deepEqual(output.lines.map(line=>line.text),['Non-refundable']);
 assert.equal(serviceConditions({conditions:{},extraTerms:'Other restrictions'}).blocked,true);
 assert.equal(serviceConditions({conditions:{rule:'x'.repeat(10001)}}).blocked,true);
 assert.equal(serviceConditions(null).blocked,true);
});

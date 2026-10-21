import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAccountReturn,accountHref} from '../src/lib/account-return';
test('account return allows only customer workspaces and non-sensitive search context',()=>{
 assert.equal(safeAccountReturn('/book?from=BOM&to=DEL&email=private%40example.test&token=secret#payment'),'/book?from=BOM&to=DEL');
 assert.equal(safeAccountReturn('/book?city=New%20Delhi'),'/book?city=New+Delhi');
 assert.equal(safeAccountReturn('/book?resumeSelection=1'),'/book?resumeSelection=1');
 assert.equal(safeAccountReturn('/book?resumeSelection=evil'),'/book');
 assert.equal(safeAccountReturn('/travellers'),'/travellers');
 assert.equal(safeAccountReturn('/my-trips?token=secret'),'/my-trips');
 assert.equal(accountHref('/book?from=BOM'),'/account?returnTo=%2Fbook%3Ffrom%3DBOM');
});
test('account return rejects external, encoded protocol-relative, control and internal auth URLs',()=>{
 for(const value of [null,{},'https://evil.test','//evil.test','/\\evil.test','/%2fevil.test','/book%0a','/book\n','/api/auth/sign-out','/account','/reset-password','/operations','javascript:alert(1)','/%ZZ','/book/../../api/auth',' /book'])assert.equal(safeAccountReturn(value),'/my-trips',String(value));
});

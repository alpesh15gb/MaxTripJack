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

test('account redirects preserve the exact bounded selection key and review intent',()=>{
 const selectionKey='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 for(const resumeReview of ['0','1']){
  const original='/book?'+new URLSearchParams({from:'BOM',resumeSelection:'1',selectionKey,resumeReview});
  const sanitized=safeAccountReturn(original);
  assert.equal(sanitized,original);
  // The helper and the account page each sanitize; neither may lose the key.
  const account=new URL(accountHref(original),'https://account-return.invalid');
  assert.equal(safeAccountReturn(account.searchParams.get('returnTo')),original);
 }
 for(const query of [`selectionKey=invalid`,`selectionKey=${selectionKey}&selectionKey=${selectionKey}`,'resumeReview=unexpected','resumeReview=0&resumeReview=1'])assert.equal(safeAccountReturn('/book?autoSearch=1&resumeSelection=1&'+query),'/my-trips');
 assert.equal(safeAccountReturn('/travellers?resumeSelection=1&selectionKey='+selectionKey),'/travellers');
});

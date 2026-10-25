import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const searchId = '11111111-1111-4111-8111-111111111111';
const actor = {userId: 'guest:fixture-owner', companyId: null as string | null};
const tomorrow = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const require = createRequire(import.meta.url);
let serial = 0;
async function harness() {
  const state = {
    actor: {...actor}, owner: {...actor}, reads: 0, providerCalls: 0, contentCalls: 0,
    limits: [] as string[], queries: [] as {sql: string; args: unknown[]}[], accessCalls: 0,
    search: {
      product: 'HOTEL', expires_at: new Date(Date.now() + 60000).toISOString(), service_kind: null as null | string,
      criteria: {product: 'HOTEL', hotelIds: ['10001'], checkIn: tomorrow(2), checkOut: tomorrow(4), adults: 2, nationality: '106', rooms: [{adults: 2, children: 1, childAge: [7]}, {adults: 1, children: 0, childAge: []}]},
      results: {reviewHash: 'PRIVATE_HASH', supplierToken: 'PRIVATE_TOKEN', hotels: [
        {tjHotelId: '10001', name: 'Fixture stay', internalEmail: 'PRIVATE_EMAIL', options: [{optionId: 'exact-bundle', roomInfo: [{name: 'Twin'}, {name: 'Single'}], pricing: {currency: 'INR', totalPrice: 8000}, commercial: {secret: 'PRIVATE_COMMISSION'}}]},
        {tjHotelId: '99999', name: 'Out of scope'},
      ]},
    },
  };
  const key = `__snapshot_test_${++serial}`;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals[key] = state;
  const stateCode = `const state=globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string, string> = {
    'server-only': '',
    'next/navigation': 'export function unstable_rethrow(){}',
    '@/lib/guest-shopping': `${stateCode} export async function shoppingAccess(request,scope){if(scope!=='detail')throw Error('Wrong scope');state.accessCalls++;return {actor:state.actor};}`,
    './request-limit': `${stateCode} export async function requestLimit(user,scope){state.limits.push(scope);}`,
    './db': `${stateCode} export function database(){return {async query(sql,args){state.queries.push({sql,args});
      if(sql.includes('FROM supplier_searches')){state.reads++;return {rows:args[0]===${JSON.stringify(searchId)}&&args[1]===state.owner.userId&&args[2]===state.owner.companyId?[state.search]:[]};}
      if(sql.includes('FROM pricing_rules'))return {rows:[{markup_minor:100,markup_basis_points:100,service_fee_minor:50}]};
      throw Error('Unexpected DB operation');
    }}}`,
    './providers/tripjack': `${stateCode} export const paths={HOTEL:{detail:'not-used'}};export async function tripjack(){state.providerCalls++;throw Error('Provider calls forbidden');}`,
    './hotel-content': `${stateCode} const content=async()=>{state.contentCalls++;throw Error('Static fetch forbidden');};content.peek=()=>({'10001':{address:'Cached property address',amenities:['Pool']}});content.statuses=()=>({'10001':'resolved'});export const hotelContentForSearch=content;`,
  };
  const output = await build({entryPoints: [resolve('src/app/api/travel/hotel-search-snapshot/route.ts')], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, plugins: [{name: 'boundaries', setup(p) {
    p.onResolve({filter: /.*/}, args => Object.hasOwn(mocks, args.path) ? {path: args.path, namespace: 'mock'} : undefined);
    p.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}]});
  const compiled = {exports: {} as {POST: (request: Request) => Promise<Response>}};
  new Function('module', 'exports', 'require', output.outputFiles[0].text)(compiled, compiled.exports, require);
  const before = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = 'https://booking.example.test';
  return {state, async call(data: unknown = {searchId}, origin = 'https://booking.example.test') {
    return compiled.exports.POST(new Request('https://booking.example.test/api/travel/hotel-search-snapshot', {method: 'POST', headers: {'content-type': 'application/json', origin}, body: JSON.stringify(data)}));
  }, cleanup() {delete globals[key];if (before === undefined) delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL = before;}};
}

test('snapshot projects owned customer hotel results, exact multi-room criteria and current markup without supplier work', async () => {
  const h = await harness();
  try {
    const response = await h.call();assert.equal(response.status, 200);assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const data = await response.json();
    assert.equal(data.searchId, searchId);assert.equal(data.expiresAt, h.state.search.expires_at);
    assert.deepEqual(data.criteria, {product: 'HOTEL', date: tomorrow(2), end: tomorrow(4), adults: '2', nationality: '106', hotelIds: '10001', rooms: JSON.stringify([{adults: 2, childAge: [7]}, {adults: 1, childAge: []}])});
    assert.equal(data.results.hotels.length, 1);assert.equal(data.results.hotels[0].customerEstimateMinor, 808150);
    assert.equal(data.results.hotels[0].options[0].optionId, 'exact-bundle');
    assert.equal(data.results.hotels[0].property.address, 'Cached property address');
    assert.equal(data.results.hotels[0].propertyContentStatus, 'resolved');
    assert.doesNotMatch(JSON.stringify(data), /PRIVATE_|guest:fixture-owner|company_id|correlation/);
    assert.equal(h.state.providerCalls, 0);assert.equal(h.state.contentCalls, 0);
    assert.deepEqual(h.state.limits, ['hotel-search-snapshot']);
    const query = h.state.queries.find(item => item.sql.includes('FROM supplier_searches'))!;
    assert.match(query.sql, /user_id=\$2 AND company_id IS NOT DISTINCT FROM \$3::uuid/);
    assert.deepEqual(query.args, [searchId, actor.userId, null]);
  } finally {h.cleanup();}
});

test('snapshot rejects foreign user, foreign company, unknown search, expiry and malformed expiry before pricing or content', async () => {
  const h = await harness();
  try {
    for (const mutate of [
      () => {h.state.actor.userId = 'another-owner';},
      () => {h.state.actor.companyId = '22222222-2222-4222-8222-222222222222';},
      () => {h.state.search.expires_at = new Date(Date.now() - 1).toISOString();},
      () => {h.state.search.expires_at = 'invalid-expiry';},
    ]) {
      h.state.actor = {...actor};h.state.search.expires_at = new Date(Date.now() + 60000).toISOString();h.state.queries = [];mutate();
      const response = await h.call();assert.equal(response.status, 409);
      assert.equal(h.state.queries.some(item => item.sql.includes('FROM pricing_rules')), false);
      assert.doesNotMatch(await response.text(), /Fixture stay|PRIVATE_/);
    }
    assert.equal((await h.call({searchId: '22222222-2222-4222-8222-222222222222'})).status, 409);
    assert.equal(h.state.providerCalls, 0);assert.equal(h.state.contentCalls, 0);
  } finally {h.cleanup();}
});

test('snapshot rejects non-hotel data, invalid criteria, foreign origins and extra request fields', async () => {
  const h = await harness();
  try {
    h.state.search.product = 'FLIGHT';assert.equal((await h.call()).status, 400);
    h.state.search.product = 'HOTEL';h.state.search.service_kind = 'service';assert.equal((await h.call()).status, 400);
    h.state.search.service_kind = null;h.state.search.criteria.rooms[0].children = 0;assert.equal((await h.call()).status, 409);
    const reads = h.state.reads, accessCalls = h.state.accessCalls;
    assert.equal((await h.call({searchId}, 'https://foreign.example.test')).status, 403);assert.equal(h.state.accessCalls, accessCalls);
    assert.equal((await h.call({searchId, actor: 'another-user'})).status, 400);
    assert.equal((await h.call({searchId: '../bad'})).status, 400);assert.equal(h.state.reads, reads);
    assert.equal(h.state.providerCalls, 0);assert.equal(h.state.contentCalls, 0);
  } finally {h.cleanup();}
});

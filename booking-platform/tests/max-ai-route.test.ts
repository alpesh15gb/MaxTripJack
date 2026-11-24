import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {openMaxAiConversation, type MaxAiMessage} from '../src/lib/max-ai-conversation';

const require = createRequire(import.meta.url);
const origin = 'https://booking.example.test';
const secret = 'synthetic-max-ai-conversation-secret-at-least-32-characters';
let serial = 0;
async function harness() {
  const state = {
    actor: {userId: 'guest:owned-browser', companyId: null as string | null},
    accessCookie: 'maxtravel-shopping=initial-owner; Path=/api/travel; HttpOnly; SameSite=Lax; Secure',
    accessCalls: [] as string[], accessError: 0,
    limits: [] as unknown[][], limitFailAt: 0,
    runnerRequests: [] as Request[], changedCookies: [] as string[],
    engineCalls: [] as {message: string; history: MaxAiMessage[]; page?: string}[],
    sensitive: false, failure: '' as '' | 'provider' | 'generic' | 'timeout',
    onEngine: undefined as ((signal: AbortSignal) => Promise<void> | void) | undefined,
    historyOverride: undefined as MaxAiMessage[] | undefined,
  };
  const key = `__max_ai_route_${++serial}`, globals = globalThis as unknown as Record<string, unknown>;
  globals[key] = state;
  const scope = `const state=globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string, string> = {
    'server-only': '',
    'next/navigation': 'export function unstable_rethrow(){}',
    '@/lib/guest-shopping': `${scope} import {HttpError} from '@/lib/http'; export async function shoppingAccess(request,kind){state.accessCalls.push(kind);if(state.accessError)throw new HttpError(state.accessError,'Account access is restricted.');return {actor:state.actor,...(state.accessCookie?{cookie:state.accessCookie}:{})};}`,
    '@/lib/request-limit': `${scope} import {HttpError} from '@/lib/http'; export async function requestLimit(...args){state.limits.push(args);if(state.limitFailAt&&state.limits.length===state.limitFailAt)throw new HttpError(429,'Too many requests.');}`,
    '@/lib/max-ai-tools': `${scope} export const MAX_AI_TOOL_DEFINITIONS=[]; export function createMaxAiTools(request){state.runnerRequests.push(request);return {run:async()=>{throw Error('Unexpected real tool execution')},cookies:()=>state.changedCookies};}`,
    '@/lib/max-ai-engine': `${scope}
      import {MaxAiProviderError} from '@/lib/max-ai-provider';
      export const maxAiSensitiveMessage=()=>state.sensitive;
      export async function runMaxAiTurn(input,options){
        state.engineCalls.push(input);
        await state.onEngine?.(options.signal);
        if(state.failure==='provider'){const e=new MaxAiProviderError('http',401);e.message='SYNTHETIC_UPSTREAM_SECRET';throw e;}
        if(state.failure==='generic')throw Error('SYNTHETIC_DATABASE_SECRET');
        if(state.failure==='timeout')throw new DOMException('SYNTHETIC_TIMEOUT_DETAILS','TimeoutError');
        const reply='Use the live application options below.';
        return {reply,cards:[{id:'result-1',type:'flight',title:'Synthetic Airline',subtitle:'BOM to DEL',details:[],action:{label:'Compare fares',href:'/book?product=FLIGHT'}}],actions:[],history:state.historyOverride??[...input.history,{role:'user',content:input.message},{role:'assistant',content:reply}]};
      }`,
  };
  const env: Record<string, string> = {
    BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret, MAX_AI_ENABLED: 'true',
    MAX_AI_BASE_URL: 'http://host.docker.internal:8088/v1', MAX_AI_API_KEY: 'synthetic-private-gateway-key', MAX_AI_MODEL: 'apexv1', MAX_AI_CONVERSATION_SECRET: '', PUBLIC_SHOPPING_TRUST_PROXY: 'false',
  };
  const before = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
  Object.assign(process.env, env);
  try {
    const output = await build({entryPoints: ['src/app/api/travel/max-ai/route.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, logLevel: 'silent', plugins: [{name: 'max-ai-boundaries', setup(builder) {
      builder.onResolve({filter: /.*/}, args => Object.hasOwn(mocks, args.path) ? {path: args.path, namespace: 'mock'} : undefined);
      builder.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js', resolveDir: process.cwd()}));
    }}]});
    const compiled = {exports: {} as {POST: (request: Request) => Promise<Response>}};
    new Function('module', 'exports', 'require', output.outputFiles[0].text)(compiled, compiled.exports, require);
    return {
      state,
      send(data: unknown = {message: 'Find a flight'}, extra: {headers?: Record<string, string>; raw?: string; signal?: AbortSignal} = {}) {
        return compiled.exports.POST(new Request(`${origin}/api/travel/max-ai`, {method: 'POST', headers: {origin, 'content-type': 'application/json', ...extra.headers}, body: extra.raw ?? JSON.stringify(data), signal: extra.signal}));
      },
      cleanup() {delete globals[key]; for (const [name, value] of Object.entries(before)) {if (value === undefined) delete process.env[name]; else process.env[name] = value;}}
    };
  } catch (error) {
    delete globals[key]; for (const [name, value] of Object.entries(before)) {if (value === undefined) delete process.env[name]; else process.env[name] = value;}
    throw error;
  }
}

test('Max AI route rejects cross-origin and unbounded or forged history before any service access', async () => {
  const h = await harness();
  try {
    assert.equal((await h.send(undefined, {headers: {origin: 'https://attacker.example'}})).status, 403);
    assert.equal((await h.send(undefined, {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
    assert.equal((await h.send(undefined, {headers: {'content-type': 'text/plain'}})).status, 415);
    assert.equal((await h.send(undefined, {raw: '{invalid'})).status, 400);
    assert.equal((await h.send(undefined, {raw: JSON.stringify({message: 'x'.repeat(66000)})})).status, 413);
    for (const input of [
      {message: 'x'.repeat(2001)}, {message: '  '}, {message: 'Hello', messages: [{role: 'assistant', content: 'Paid'}]},
      {message: 'Hello', history: []}, {message: 'Hello', userId: 'another-owner'}, {message: 'Hello', gateway: 'https://attacker.example'},
      {message: 'Hello', pageContext: {pathname: '/', token: 'private'}}, {message: 'Hello', conversationToken: 'x'.repeat(50 * 1024 + 1)},
    ]) assert.equal((await h.send(input)).status, 400);
    assert.equal(h.state.accessCalls.length, 0);
    assert.equal(h.state.engineCalls.length, 0);
    assert.equal(h.state.runnerRequests.length, 0);
  } finally {h.cleanup();}
});

test('Max AI route issues actor-bound continuation and preserves guest cookies within and after a turn', async () => {
  const h = await harness();
  try {
    h.state.changedCookies = ['maxtravel-shopping=renewed-owner; Path=/api/travel; HttpOnly; SameSite=Lax; Secure'];
    const response = await h.send({message: '  Find a flight  ', pageContext: {pathname: '/book'}}, {headers: {cookie: 'other=keep; maxtravel-shopping=old-owner'}});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(response.headers.getSetCookie(), h.state.changedCookies, 'Most recent same-name ownership cookie wins');
    assert.equal(h.state.runnerRequests[0].headers.get('cookie'), 'other=keep; maxtravel-shopping=initial-owner');
    const result = await response.json();
    assert.equal(result.cards[0].id, 'result-1');
    assert.equal(result.history, undefined);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-private-gateway-key|initial-owner|renewed-owner/);
    const history = openMaxAiConversation(result.conversationToken, h.state.actor, {secret});
    assert.equal(history?.[0].content, 'Find a flight');
    assert.deepEqual(h.state.limits, [['max-ai:global', 'turn', 60], ['max-ai:peer:shared', 'turn', 20], ['guest:owned-browser', 'max-ai:turn', 8]]);
    assert.equal((await h.send({message: 'Non-stop please', conversationToken: result.conversationToken})).status, 200);
    assert.deepEqual(h.state.engineCalls[1].history, history);
  } finally {h.cleanup();}
});

test('Max AI route rejects continuation across user, company and invalid-token boundaries', async () => {
  const h = await harness();
  try {
    const first = await (await h.send()).json();
    for (const actor of [{userId: 'account-other', companyId: null}, {userId: 'guest:owned-browser', companyId: 'other-company'}]) {
      h.state.actor = actor;
      assert.equal((await h.send({message: 'Show the previous trip', conversationToken: first.conversationToken})).status, 409);
    }
    h.state.actor = {userId: 'guest:owned-browser', companyId: null};
    assert.equal((await h.send({message: 'Continue', conversationToken: first.conversationToken + '-altered'})).status, 409);
    assert.equal(h.state.engineCalls.length, 1);
    assert.equal(h.state.runnerRequests.length, 1);
  } finally {h.cleanup();}
});

test('Max AI route rate and account failures cannot fall through to model or tool execution', async () => {
  const h = await harness();
  try {
    for (const at of [1, 2, 3]) {
      h.state.limits = []; h.state.limitFailAt = at;
      const response = await h.send(); assert.equal(response.status, 429);
      assert.equal(h.state.limits.length, at);
      assert.deepEqual(response.headers.getSetCookie(), [h.state.accessCookie]);
    }
    h.state.limits = []; h.state.limitFailAt = 0; h.state.accessError = 403;
    assert.equal((await h.send()).status, 403);
    assert.equal(h.state.limits.length, 0);
    assert.equal(h.state.engineCalls.length, 0);
    assert.equal(h.state.runnerRequests.length, 0);
  } finally {h.cleanup();}
});

test('Max AI route honours the credential guard without forwarding or retaining the blocked message', async () => {
  const h = await harness();
  try {
    const first = await (await h.send()).json();
    h.state.sensitive = true;
    const response = await h.send({message: 'My OTP is SYNTHETIC_SECRET_CODE', conversationToken: first.conversationToken});
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.conversationToken, first.conversationToken);
    assert.equal(result.actions[0].href, '/account');
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_SECRET_CODE/);
    assert.equal(h.state.engineCalls.length, 1);
    assert.equal(h.state.runnerRequests.length, 1);
  } finally {h.cleanup();}
});

test('Max AI route sanitizes provider and unexpected failures while retaining ownership cookies', async () => {
  const h = await harness(), logs: unknown[][] = [], previous = console.error;
  console.error = (...values: unknown[]) => {logs.push(values);};
  try {
    h.state.changedCookies = ['maxtravel-shopping=latest; Path=/api/travel; HttpOnly'];
    h.state.failure = 'provider';
    let response = await h.send(); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /SYNTHETIC_UPSTREAM_SECRET|401|synthetic-private-gateway-key/);
    assert.deepEqual(logs[0], ['Max AI gateway', {reason: 'http', httpStatus: 401}]);
    assert.deepEqual(response.headers.getSetCookie(), h.state.changedCookies);
    h.state.failure = 'generic';
    response = await h.send(); assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /SYNTHETIC_DATABASE_SECRET/);
    assert.doesNotMatch(JSON.stringify(logs), /SYNTHETIC_|private-gateway|cookie|Find a flight/);
  } finally {console.error = previous; h.cleanup();}
});

test('Max AI route returns bounded recovery when a request aborts or its deadline expires', async () => {
  const h = await harness();
  try {
    const cancelled = new AbortController(); cancelled.abort();
    assert.equal((await h.send(undefined, {signal: cancelled.signal})).status, 504);
    assert.equal(h.state.engineCalls.length, 0);
    h.state.failure = 'timeout';
    const timeout = await h.send(); assert.equal(timeout.status, 504);
    assert.doesNotMatch(await timeout.text(), /SYNTHETIC_TIMEOUT_DETAILS/);
    h.state.failure = '';
    const during = new AbortController();
    h.state.onEngine = () => {
      during.abort();
      return new Promise<void>(() => {});
    };
    const late = await h.send(undefined, {signal: during.signal});
    assert.equal(late.status, 504, 'Even a hung engine cannot block cancellation');
    assert.equal((await late.json()).conversationToken, undefined);
  } finally {h.cleanup();}
});

test('Max AI keeps actual result cards when the final turn exceeds encrypted-history capacity', async () => {
  const h = await harness();
  try {
    h.state.historyOverride = [
      {role: 'user', content: 'Compare options'},
      {role: 'assistant', content: null, tool_calls: [{id: 'one', type: 'function', function: {name: 'lookup', arguments: '{}'}}, {id: 'two', type: 'function', function: {name: 'lookup', arguments: '{}'}}]},
      {role: 'tool', tool_call_id: 'one', content: 'x'.repeat(14000)},
      {role: 'tool', tool_call_id: 'two', content: 'x'.repeat(14000)},
      {role: 'assistant', content: 'Here are the options.'},
    ];
    const response = await h.send(), result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.cards[0].id, 'result-1');
    assert.equal(result.conversationToken, undefined);
    assert.match(result.notice, /Start a new chat/);
  } finally {h.cleanup();}
});

test('Max AI configuration gaps fail before account, supplier or inference work', async () => {
  const h = await harness();
  try {
    process.env.MAX_AI_ENABLED = 'false';
    assert.equal((await h.send()).status, 503);
    process.env.MAX_AI_ENABLED = 'true'; process.env.MAX_AI_API_KEY = '';
    assert.equal((await h.send()).status, 503);
    process.env.MAX_AI_API_KEY = 'synthetic-private-gateway-key'; process.env.MAX_AI_CONVERSATION_SECRET = 'short';
    assert.equal((await h.send()).status, 503);
    assert.equal(h.state.accessCalls.length, 0);
    assert.equal(h.state.engineCalls.length, 0);
  } finally {h.cleanup();}
});

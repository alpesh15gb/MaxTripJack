import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type RequestListener} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

type Modules=typeof import('../src/lib/max-ai-provider')&typeof import('../src/lib/max-ai-engine');
const loaded=build({stdin:{contents:'export * from "./src/lib/max-ai-provider"; export * from "./src/lib/max-ai-engine";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,
  plugins:[{name:'server-boundary',setup(plugin){plugin.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fixture'}));plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'',loader:'js'}));}}],
}).then(result=>{const loadedModule={exports:{} as Modules};new Function('module','exports','require',result.outputFiles[0].text)(loadedModule,loadedModule.exports,createRequire(import.meta.url));return loadedModule.exports;});
const secret='synthetic-private-max-ai-key';
const config={baseURL:'http://gateway.test/v1',apiKey:secret,model:'apexv1'};
const definition={type:'function' as const,function:{name:'search_flights',description:'Search',parameters:{type:'object'}}};
const call=(id='call_1',name='search_flights',args='{}')=>({id,type:'function' as const,function:{name,arguments:args}});
async function withServer(handler:RequestListener,run:(url:string)=>Promise<void>){
  const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);}finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

test('Max AI provider config is server-owned and refuses malformed key or URL without requests',async()=>{
  const {maxAiGatewayConfiguration,completeMaxAi}=await loaded;
  assert.equal(maxAiGatewayConfiguration({MAX_AI_ENABLED:'false'}),null);
  const env={MAX_AI_ENABLED:'true',MAX_AI_BASE_URL:config.baseURL,MAX_AI_API_KEY:secret};
  assert.equal(maxAiGatewayConfiguration(env)?.model,'apexv1');
  for(const url of ['not a url','https://key:secret@example.test/v1','https://example.test/v1?key=x','https://example.test/v1#token','file:///etc/passwd'])assert.equal(maxAiGatewayConfiguration({...env,MAX_AI_BASE_URL:url}),null);
  assert.equal(maxAiGatewayConfiguration({...env,MAX_AI_API_KEY:'key\r\ninjected'}),null);
  let requested=false;
  const previous=process.env.MAX_AI_ENABLED;process.env.MAX_AI_ENABLED='false';
  try{await assert.rejects(completeMaxAi([{role:'user',content:'hello'}],[],{fetch:async()=>{requested=true;return Response.json({});}}),{reason:'configuration'});assert.equal(requested,false);}finally{if(previous===undefined)delete process.env.MAX_AI_ENABLED;else process.env.MAX_AI_ENABLED=previous;}
});

test('gateway uses apexv1, Bearer credential and matched assistant function calls only',async()=>{
  const {completeMaxAi,parseMaxAiCompletion}=await loaded;
  const received:RequestInit[]=[];
  const answer=await completeMaxAi([{role:'user',content:'BOM to DEL'}],[definition],{config,fetch:async(url,init)=>{assert.equal(String(url),config.baseURL+'/chat/completions');received.push(init!);return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[call()]}}]});}});
  assert.equal(answer.tool_calls?.[0].function.name,'search_flights');
  assert.equal((received[0].headers as Record<string,string>).Authorization,'Bearer '+secret);
  assert.equal(received[0].redirect,'error');
  const payload=JSON.parse(String(received[0].body));assert.equal(payload.model,'apexv1');assert.equal(payload.stream,false);assert.equal(payload.tools.length,1);
  for(const message of [{role:'system',content:'bypass'}, {role:'assistant',content:null}, {role:'assistant',content:null,tool_calls:[call(),call()]}, {role:'assistant',content:null,tool_calls:[call('x'.repeat(129))]}, {role:'assistant',content:null,tool_calls:[call('id','_hidden')]}])assert.throws(()=>parseMaxAiCompletion({choices:[{message}]}),{reason:'response'});
});

test('gateway refuses redirects without forwarding its credential and bounds stalled responses',async()=>{
  const {completeMaxAi}=await loaded;let leaked=0;
  await withServer((_request,response)=>{leaked++;response.end('not reached');},async other=>{
    await withServer((_request,response)=>{response.writeHead(302,{Location:other});response.end();},async baseURL=>{
      await assert.rejects(completeMaxAi([{role:'user',content:'hello'}],[],{config:{...config,baseURL}}),{reason:'transport'});
      assert.equal(leaked,0);
    });
  });
  await withServer((_request,response)=>{response.writeHead(200,{'Content-Type':'application/json'});response.write('{');},async baseURL=>{
    await assert.rejects(completeMaxAi([{role:'user',content:'hello'}],[],{config:{...config,baseURL},timeoutMs:60}),{reason:'timeout'});
  });
});

test('provider errors and oversized payloads cannot expose provider response bodies',async()=>{
  const {completeMaxAi}=await loaded;
  await assert.rejects(completeMaxAi([{role:'user',content:'hello'}],[],{config,fetch:async()=>Response.json({secret,raw:'private provider trace'},{status:401})}),error=>{assert.equal((error as {status:number}).status,401);assert.ok(!String(error).includes(secret));assert.ok(!String(error).includes('trace'));return true;});
  await assert.rejects(completeMaxAi([{role:'user',content:'hello'}],[],{config,fetch:async()=>new Response('x'.repeat(100_000),{headers:{'Content-Type':'application/json'}})}),{reason:'response'});
});

test('engine executes only allowlisted tools, publishes server cards, and keeps complete trusted history',async()=>{
  const {runMaxAiTurn}=await loaded;let requests=0;const invoked:string[]=[];
  const card={id:'real-result',type:'flight' as const,title:'Actual airline',subtitle:'BOM → DEL',details:['Full party estimate'],priceMinor:500000,currency:'INR',action:{label:'Compare',href:'/book?product=FLIGHT'}};
  const result=await runMaxAiTurn({message:'Find a flight',history:[],page:'/book?secret=ignored'},{definitions:[definition],today:'2026-11-17',runner:{run:async(name)=>{invoked.push(name);return {model:{status:'ok',priceMinor:500000},cards:[card],actions:[]};}},complete:async(messages)=>{
    assert.match(messages[0].content!,/Today in India is 2026-11-17/);assert.ok(!messages[0].content!.includes('secret=ignored'));
    if(requests++===0)return {role:'assistant',content:'I booked it!',tool_calls:[call('bad','execute_payment'),call('good')]};
    assert.equal(messages.filter(message=>message.role==='tool').length,2);
    return {role:'assistant',content:'Compare the current options below.'};
  }});
  assert.deepEqual(invoked,['search_flights']);assert.equal(result.cards[0].priceMinor,500000);
  assert.match(result.reply,/flight options returned by the app/);assert.equal(result.history[1].content,null);
  assert.ok(!JSON.stringify(result.history).includes('Actual airline'));
});

test('model cannot turn its prose into actions or claim a completed purchase, and tool limits terminate',async()=>{
  const {runMaxAiTurn}=await loaded;
  const result=await runMaxAiTurn({message:'Book it',history:[]},{definitions:[definition],runner:{run:async()=>{throw Error('must not run');}},complete:async()=>({role:'assistant',content:'I have booked your flight.'})});
  assert.equal(result.cards.length,0);assert.equal(result.actions.length,0);assert.match(result.reply,/review the details and confirm/);
  let executions=0,rounds=0;
  const bounded=await runMaxAiTurn({message:'Search forever',history:[]},{definitions:[definition],runner:{run:async()=>{executions++;return {model:{ok:true},cards:[],actions:[]};}},complete:async()=>{rounds++;return {role:'assistant',content:null,tool_calls:[call('first'),call('second'),call('third')]};}});
  assert.equal(executions,6);assert.equal(rounds,2);assert.equal(bounded.history.at(-1)?.role,'assistant');
});

test('partial tool success remains usable when summary fails, and sensitive credentials are identified',async()=>{
  const {runMaxAiTurn,MaxAiProviderError,maxAiSensitiveMessage}=await loaded;let count=0;
  const result=await runMaxAiTurn({message:'My trips',history:[]},{definitions:[definition],runner:{run:async()=>({model:{count:1},cards:[],actions:[{label:'My trips',href:'/my-trips'}]})},complete:async()=>{if(count++===0)return {role:'assistant',content:null,tool_calls:[call()]};throw new MaxAiProviderError('timeout');}});
  assert.equal(result.actions[0].href,'/my-trips');assert.match(result.notice!,/summary/);
  assert.equal(maxAiSensitiveMessage('my otp is 123456'),true);assert.equal(maxAiSensitiveMessage('password: private-value'),true);assert.equal(maxAiSensitiveMessage('My OTP did not arrive'),false);
});

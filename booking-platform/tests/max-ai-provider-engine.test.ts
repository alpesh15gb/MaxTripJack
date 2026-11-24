import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type RequestListener} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {trimMaxAiConversation,sealMaxAiConversation,openMaxAiConversation,type MaxAiMessage} from '../src/lib/max-ai-conversation';
import type {EnquiryDraft} from '../src/lib/travel-enquiry-contract';

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
  assert.equal(payload.max_tokens,900);
  for(const message of [{role:'system',content:'bypass'}, {role:'assistant',content:null}, {role:'assistant',content:null,tool_calls:[call(),call()]}, {role:'assistant',content:null,tool_calls:[call('x'.repeat(129))]}, {role:'assistant',content:null,tool_calls:[call('id','_hidden')]}])assert.throws(()=>parseMaxAiCompletion({choices:[{message}]}),{reason:'response'});
});

test('general questions use a smaller tool-free model call and stable travel definitions skip the gateway',async()=>{
  const {runMaxAiTurn,completeMaxAi}=await loaded;
  let calls=0;
  const pnr=await runMaxAiTurn({message:'What is the difference between an airline PNR and an e-ticket number?',history:[]},{definitions:[definition],runner:{run:async()=>{throw Error('No tool required');}},complete:async()=>{calls++;throw Error('No model required');}});
  assert.equal(calls,0);assert.equal(pnr.metrics.modelCalls,0);assert.match(pnr.reply,/does not prove/);
  const general=await runMaxAiTurn({message:'What is a layover?',history:[]},{definitions:[definition],runner:{run:async()=>{throw Error('No tool required');}},complete:async(messages,tools)=>{
    calls++;assert.equal(tools.length,0);assert.ok(messages[0].content!.length<1000);return {role:'assistant',content:'A layover is time between connecting flights.'};
  }});
  assert.equal(calls,1);assert.match(general.reply,/connecting flights/);
  await completeMaxAi([{role:'user',content:'What is a layover?'}],[],{config,fetch:async(_url,init)=>{
    const payload=JSON.parse(String(init?.body));assert.equal(payload.max_tokens,320);assert.equal(payload.tools,undefined);
    return Response.json({choices:[{message:{role:'assistant',content:'A layover is time between connecting flights.'}}]});
  }});
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
  const result=await runMaxAiTurn({message:'Find a non-stop BOM to DEL flight on 30 November for one adult',history:[],page:'/book?secret=ignored'},{definitions:[definition],today:'2026-11-17',runner:{run:async(name)=>{invoked.push(name);return {model:{status:'ok',priceMinor:500000},cards:[card],actions:[]};}},complete:async(messages)=>{
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

const toolDefinition=(name:string)=>({...definition,function:{...definition.function,name}});
const validDraft:EnquiryDraft={service:'HOLIDAY',destination:'Bali',travelWindow:'December 2026, flexible',adults:2,childAges:[],departureCity:'Hyderabad',budgetRupees:80000,budgetBasis:'TOTAL'};

test('first service qualification returns useful questions with zero provider or supplier calls',async()=>{
  const {runMaxAiTurn}=await loaded;
  for(const message of ['I want a visa','I need travel insurance','Plan a holiday package','Help me plan a cruise','I want to book a flight ticket','Find a hotel']){
    let modelCalls=0,toolCalls=0;
    const result=await runMaxAiTurn({message,history:[]},{definitions:[definition],runner:{run:async()=>{toolCalls++;throw Error('A qualification must not search or submit');}},complete:async()=>{modelCalls++;throw Error('A narrow first request must not wait for the gateway');}});
    assert.equal(modelCalls,0,message);assert.equal(toolCalls,0,message);
    assert.equal(result.metrics.modelCalls,0);assert.equal(result.metrics.fastPath,'qualification');
    assert.equal(result.enquiryDraft,undefined);assert.equal(result.cards.length,0);
    assert.ok(result.reply.includes('?'),message);
    assert.deepEqual(trimMaxAiConversation(result.history),result.history);
  }
});

test('complete search cards eliminate the follow-up provider request while preserving resumable tool history',async()=>{
  const {runMaxAiTurn}=await loaded;
  for(const [name,type] of [['search_flights','flight'],['search_hotels','hotel']] as const){
    let modelCalls=0;
    const card={id:`${name}:result`,type,title:'Checked option',subtitle:'Synthetic itinerary',details:[],priceMinor:500000,currency:'INR',action:{label:'Review',href:'/book'}};
    const result=await runMaxAiTurn({message:'Show options for the details I supplied',history:[]},{definitions:[toolDefinition(name)],runner:{run:async()=>({model:{status:'ok',count:1},cards:[card],actions:[]})},complete:async()=>{
      modelCalls++;assert.equal(modelCalls,1,'A complete result must not request a redundant model summary');
      return {role:'assistant',content:'I booked your holiday!',tool_calls:[call('ready',name)]};
    }});
    assert.equal(modelCalls,1);assert.equal(result.metrics.modelCalls,1);assert.equal(result.metrics.toolCalls,1);assert.equal(result.metrics.fastPath,'terminal_tools');
    assert.deepEqual(result.cards,[card]);assert.equal(result.history[1].content,null);
    assert.doesNotMatch(result.reply,/I booked|booked your/i);
    const actor={userId:'synthetic-guest',companyId:null},secret='synthetic-conversation-secret-longer-than-thirty-two';
    const token=sealMaxAiConversation(result.history,actor,{secret,now:1000});
    assert.deepEqual(openMaxAiConversation(token,actor,{secret,now:1001}),result.history);
  }
});

test('a prepared enquiry renders a review form without a summary request or a false saved claim',async()=>{
  const {runMaxAiTurn}=await loaded;let calls=0;
  const result=await runMaxAiTurn({message:'Please prepare that Bali holiday enquiry',history:[]},{definitions:[toolDefinition('prepare_enquiry')],runner:{run:async()=>({model:{status:'draft_ready',service:'HOLIDAY'},cards:[],actions:[],enquiryDraft:validDraft})},complete:async()=>{
    calls++;assert.equal(calls,1);return {role:'assistant',content:'Your enquiry has been submitted.',tool_calls:[call('draft','prepare_enquiry',JSON.stringify(validDraft))]};
  }});
  assert.equal(result.metrics.modelCalls,1);assert.deepEqual(result.enquiryDraft,validDraft);
  assert.match(result.reply,/review/i);assert.match(result.reply,/nothing has been submitted/i);
  assert.doesNotMatch(result.reply,/has been saved|has been sent|your enquiry has been submitted/i);
  assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('a package card and prepared enquiry from the same turn both survive the single-call terminal path',async()=>{
  const {runMaxAiTurn}=await loaded;let calls=0;
  const card={id:'bali-package',type:'package' as const,title:'Published Bali holiday',subtitle:'Bali',details:[],priceMinor:8000000,currency:'INR',action:{label:'View package',href:'/packages/bali-holiday'}};
  const result=await runMaxAiTurn({message:'Show the matching Bali plan and prepare my enquiry',history:[]},{definitions:[toolDefinition('find_packages'),toolDefinition('prepare_enquiry')],runner:{run:async(name)=>name==='find_packages'?{model:{status:'ok'},cards:[card],actions:[]}:{model:{status:'draft_ready'},cards:[],actions:[],enquiryDraft:validDraft}},complete:async()=>{
    calls++;assert.equal(calls,1);return {role:'assistant',content:null,tool_calls:[call('packages','find_packages','{"query":"Bali"}'),call('draft','prepare_enquiry',JSON.stringify(validDraft))]};
  }});
  assert.equal(calls,1);assert.deepEqual(result.cards,[card]);assert.deepEqual(result.enquiryDraft,validDraft);
  assert.match(result.reply,/published holiday packages/i);assert.match(result.reply,/nothing has been submitted/i);
  assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('mixed lookup and terminal calls retain both tool results and continue model reasoning',async()=>{
  const {runMaxAiTurn}=await loaded;let calls=0;
  const names:string[]=[];
  const result=await runMaxAiTurn({message:'Find a flight and clarify the other airport',history:[]},{definitions:[definition,toolDefinition('lookup_airports')],runner:{run:async(name)=>{
    names.push(name);
    return name==='lookup_airports'?{model:{status:'ok',airports:[{code:'BOM'},{code:'NMI'}]},cards:[],actions:[]}:{model:{status:'ok'},cards:[{id:'checked-flight',type:'flight' as const,title:'Checked airline',subtitle:'DEL to HYD',details:[],action:{label:'Compare flights',href:'/book?product=FLIGHT'}}],actions:[]};
  }},complete:async(messages)=>{
    calls++;
    if(calls===1)return {role:'assistant',content:null,tool_calls:[call('search','search_flights'),call('lookup','lookup_airports','{"query":"Mumbai"}')]};
    assert.equal(messages.filter(message=>message.role==='tool').length,2);
    return {role:'assistant',content:'For the other journey, do you mean BOM or NMI?'};
  }});
  assert.equal(calls,2);assert.deepEqual(names,['search_flights','lookup_airports']);
  assert.match(result.reply,/BOM or NMI/);assert.equal(result.metrics.fastPath,'model');
  assert.match(result.reply,/flight options returned by the app/);assert.equal(result.cards.length,1);
  assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('catalogue lookup can continue into a custom holiday draft without another customer message',async()=>{
  const {runMaxAiTurn}=await loaded;
  for(const hasPackage of [false,true]){
    let modelCalls=0;const executed:string[]=[];
    const packageCard={id:'published-bali',type:'package' as const,title:'Published Bali plan',subtitle:'Bali',details:[],action:{label:'View package',href:'/packages/bali-holiday'}};
    const result=await runMaxAiTurn({message:'Please prepare a Bali holiday enquiry from Hyderabad for two adults in December, total budget 80000 INR',history:[]},{definitions:[toolDefinition('find_packages'),toolDefinition('prepare_enquiry')],runner:{run:async(name)=>{
      executed.push(name);return name==='find_packages'?{model:{status:'ok',packages:hasPackage?[{title:'Published Bali plan'}]:[]},cards:hasPackage?[packageCard]:[],actions:[]}:{model:{status:'draft_ready'},cards:[],actions:[],enquiryDraft:validDraft};
    }},complete:async(messages)=>{
      if(++modelCalls===1)return {role:'assistant',content:null,tool_calls:[call('catalogue','find_packages','{"query":"Bali"}')]};
      assert.equal(modelCalls,2,'Preparing the draft itself must not add a summary call');
      assert.equal(messages.at(-1)?.role,'tool');
      return {role:'assistant',content:null,tool_calls:[call('draft','prepare_enquiry',JSON.stringify(validDraft))]};
    }});
    assert.deepEqual(executed,['find_packages','prepare_enquiry']);assert.equal(modelCalls,2);
    assert.deepEqual(result.enquiryDraft,validDraft);assert.equal(result.cards.length,hasPackage?1:0);
    assert.match(result.reply,/nothing has been submitted/i);assert.deepEqual(trimMaxAiConversation(result.history),result.history);
  }
});

test('empty hotel destination pages continue with the returned cursor before presenting checked stays',async()=>{
  const {runMaxAiTurn}=await loaded;let modelCalls=0,toolCalls=0;
  const criteria={regionId:'56',checkIn:'2026-12-01',checkOut:'2026-12-03',rooms:[{adults:2,childAge:[]}],nationality:'106'};
  const result=await runMaxAiTurn({message:'Check hotels for the room and nationality details already supplied',history:[]},{definitions:[toolDefinition('search_hotels')],runner:{run:async(_name,args)=>{
    if(++toolCalls===1){assert.deepEqual(args,criteria);return {model:{status:'ok',moreDestinationPages:true,nextCursor:'0:1',criteria},cards:[],actions:[]};}
    assert.deepEqual(args,{...criteria,cursor:'0:1'});
    return {model:{status:'ok',moreDestinationPages:false,nextCursor:null},cards:[{id:'checked-stay',type:'hotel' as const,title:'Checked stay',subtitle:'Goa',details:[],action:{label:'View rooms',href:'/book?product=HOTEL'}}],actions:[]};
  }},complete:async(messages)=>{
    modelCalls++;assert.ok(modelCalls<=2);
    if(modelCalls===2){const output=JSON.parse(String(messages.at(-1)?.content));assert.equal(output.nextCursor,'0:1');}
    return {role:'assistant',content:null,tool_calls:[call('hotels-'+modelCalls,'search_hotels',JSON.stringify({...criteria,...(modelCalls===2?{cursor:'0:1'}:{})}))]};
  }});
  assert.equal(modelCalls,2);assert.equal(toolCalls,2);assert.equal(result.cards.length,1);
  assert.match(result.reply,/hotel options returned by the app/);assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('a prepared draft retains other planning questions while rejecting price and completion claims in questions',async()=>{
  const {runMaxAiTurn}=await loaded;let modelCalls=0;
  const result=await runMaxAiTurn({message:'Prepare that holiday enquiry and clarify the airport for my separate flight',history:[]},{definitions:[toolDefinition('prepare_enquiry'),toolDefinition('lookup_airports')],runner:{run:async(name)=>name==='prepare_enquiry'?{model:{status:'draft_ready'},cards:[],actions:[],enquiryDraft:validDraft}:{model:{status:'ok',airports:[{code:'BOM'},{code:'NMI'}]},cards:[],actions:[]}},complete:async()=>{
    if(++modelCalls===1)return {role:'assistant',content:null,tool_calls:[call('draft','prepare_enquiry',JSON.stringify(validDraft)),call('airport','lookup_airports','{"query":"Mumbai"}')]};
    return {role:'assistant',content:'Which dates work for the ₹1 confirmed fare? Which airport for your flight I booked? For the other journey, do you mean BOM or NMI?'};
  }});
  assert.equal(modelCalls,2);assert.deepEqual(result.enquiryDraft,validDraft);
  assert.match(result.reply,/nothing has been submitted/i);assert.match(result.reply,/BOM or NMI/);
  assert.doesNotMatch(result.reply,/₹1|confirmed fare|I booked/);assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('a failed or invalid draft requires another model step rather than falsely reporting a ready form',async()=>{
  const {runMaxAiTurn}=await loaded;
  for(const toolResult of [
    {model:{status:'needs_input',fields:['departureCity']},cards:[],actions:[]},
    {model:{status:'unavailable'},cards:[],actions:[]},
    {model:{status:'draft_ready'},cards:[],actions:[],enquiryDraft:{...validDraft,departureCity:undefined} as EnquiryDraft},
  ]){
    let calls=0;
    const result=await runMaxAiTurn({message:'Prepare the holiday request',history:[]},{definitions:[toolDefinition('prepare_enquiry')],runner:{run:async()=>toolResult},complete:async()=>{
      if(++calls===1)return {role:'assistant',content:null,tool_calls:[call('draft','prepare_enquiry')]};
      return {role:'assistant',content:'Which city will you depart from?'};
    }});
    assert.equal(calls,2);assert.equal(result.enquiryDraft,undefined);assert.match(result.reply,/depart from/);
    assert.deepEqual(trimMaxAiConversation(result.history),result.history);
  }
});

test('empty successful inventory returns its recovery action without a model paraphrase or invented fare',async()=>{
  const {runMaxAiTurn}=await loaded;let calls=0;
  const result=await runMaxAiTurn({message:'Check the exact flight details I gave',history:[]},{definitions:[definition],runner:{run:async()=>({model:{status:'ok',count:0},cards:[],actions:[{label:'Adjust search',href:'/book?product=FLIGHT'}]})},complete:async()=>{
    calls++;assert.equal(calls,1);return {role:'assistant',content:null,tool_calls:[call()]};
  }});
  assert.equal(calls,1);assert.equal(result.cards.length,0);assert.match(result.reply,/No matching options/);
  assert.deepEqual(result.actions,[{label:'Adjust search',href:'/book?product=FLIGHT'}]);
  assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('a usable draft survives provider failure after mixed tool results',async()=>{
  const {runMaxAiTurn,MaxAiProviderError}=await loaded;let calls=0;
  const result=await runMaxAiTurn({message:'Prepare my holiday enquiry and check the office information',history:[]},{definitions:[toolDefinition('prepare_enquiry'),toolDefinition('company_info')],runner:{run:async(name)=>name==='prepare_enquiry'?{model:{status:'draft_ready'},cards:[],actions:[],enquiryDraft:validDraft}:{model:{status:'unavailable'},cards:[],actions:[]}},complete:async()=>{
    if(++calls===1)return {role:'assistant',content:null,tool_calls:[call('draft','prepare_enquiry'),call('office','company_info')]};
    throw new MaxAiProviderError('timeout');
  }});
  assert.equal(calls,2);assert.deepEqual(result.enquiryDraft,validDraft);assert.match(result.reply,/nothing has been submitted/i);
  assert.ok(result.notice);assert.deepEqual(trimMaxAiConversation(result.history),result.history);
});

test('direct own-trip intent uses the current allowed read tool without sending private records to the model',async()=>{
  const {runMaxAiTurn}=await loaded;
  const history:MaxAiMessage[]=[{role:'user',content:'I need travel help'},{role:'assistant',content:'What would you like to check?'}];
  const cases=[
    {model:{status:'sign_in_required'},cards:[],actions:[{label:'Sign in',href:'/account'}]},
    {model:{status:'access_required'},cards:[],actions:[{label:'Check account',href:'/account'}]},
    {model:{status:'ok',count:0},cards:[],actions:[{label:'My trips',href:'/my-trips'}]},
    {model:{status:'ok',count:1},cards:[{id:'private-trip',type:'trip' as const,title:'MT-PRIVATE',subtitle:'Private itinerary',details:[],action:{label:'View trip',href:'/my-trips'}}],actions:[]},
  ];
  for(const expected of cases){
    let modelCalls=0,toolCalls=0;
    const result=await runMaxAiTurn({message:'Show my bookings',history},{definitions:[toolDefinition('my_trips')],runner:{run:async(name,args)=>{toolCalls++;assert.equal(name,'my_trips');assert.deepEqual(args,{});return expected;}},complete:async()=>{modelCalls++;throw Error('Private trip lookup does not need the gateway');}});
    assert.equal(modelCalls,0);assert.equal(toolCalls,1);assert.equal(result.metrics.fastPath,'owned_trips');
    assert.deepEqual(result.cards,expected.cards);assert.ok(!JSON.stringify(result.history).includes('MT-PRIVATE'));
    assert.deepEqual(trimMaxAiConversation(result.history),result.history);
    if(expected.model.status==='sign_in_required')assert.match(result.reply,/Sign in securely/);
    if(expected.model.status==='access_required')assert.match(result.reply,/verification or permission/);
    if(expected.model.status==='ok'&&expected.model.count===0)assert.match(result.reply,/No bookings were found/);
  }
});

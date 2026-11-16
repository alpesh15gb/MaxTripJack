import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {isMaxAiActionHref} from '../src/lib/max-ai-contract';
import {businessProfile} from '../src/lib/business-profile';
import type {MaxAiToolDispatch} from '../src/lib/max-ai-tools';

type Tools=typeof import('../src/lib/max-ai-tools');
const require=createRequire(import.meta.url);
const compiled=build({entryPoints:['src/lib/max-ai-tools.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,
  plugins:[{name:'tool-boundaries',setup(plugin){
    plugin.onResolve({filter:/^server-only$|^@\/app\/api\//},args=>({path:args.path,namespace:'boundary'}));
    plugin.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:args.path==='server-only'?'':'export async function GET(){throw Error("Unexpected live GET")};export async function POST(){throw Error("Unexpected live POST")}',loader:'js'}));
  }}]}).then(output=>{const loaded={exports:{} as Tools};new Function('module','exports','require',output.outputFiles[0].text)(loaded,loaded.exports,require);return loaded.exports;});
const searchId='11111111-1111-4111-8111-111111111111';
const request=()=>new Request('https://maxtravel.test/api/travel/max-ai',{method:'POST',headers:{origin:'https://maxtravel.test','content-type':'application/json',cookie:'auth=PRIVATE_AUTH'}});
const now=()=>new Date('2026-11-17T12:00:00Z');
const flight={sI:[{dt:'2026-12-01T09:15:00',at:'2026-12-01T11:25:00',duration:130,da:{code:'BOM',city:'Mumbai'},aa:{code:'DEL',city:'Delhi'},fD:{fN:'201',aI:{name:'Synthetic Air',code:'6E'}}}],totalPriceList:[{id:'fare-exact',fareIdentifier:'PUBLISHED',customerEstimateMinor:765432,fD:{ADULT:{bI:{cB:'7 Kg'},rT:1}},supplierMinor:123,secret:'PRIVATE_COST'}],privateSupplierToken:'PRIVATE_SUPPLIER_TOKEN'};
const searchArgs={from:'BOM',to:'DEL',date:'2026-12-01',adults:2};

test('Max AI tools reject unsupported calls, injected fields, invalid dates and guessed airport codes before dispatch',async()=>{
  const {createMaxAiTools}=await compiled;let calls=0;
  const tools=createMaxAiTools(request(),{now,dispatch:async()=>{calls++;throw Error('must not call');}});
  for(const [name,args,status] of [
    ['execute_payment',{amount:10},'unsupported'],['search_flights',{...searchArgs,actor:'foreign'},'needs_input'],
    ['search_flights',{...searchArgs,from:'ZZZ'},'needs_input'],['search_flights',{...searchArgs,date:'2026-02-30'},'needs_input'],
    ['search_flights',{...searchArgs,date:'2020-01-01'},'needs_input'],['navigate_task',{task:'https://evil.test'},'needs_input'],
  ] as const)assert.equal((await tools.run(name,args)).model.status,status);
  assert.equal(calls,0);
});

test('flight tool keeps customer estimates and exact owned search handoff, never supplier costs or provider tokens',async()=>{
  const {createMaxAiTools}=await compiled;let submitted:unknown;
  const tools=createMaxAiTools(request(),{now,dispatch:async(endpoint,req)=>{
    assert.equal(endpoint,'search');submitted=await req.json();assert.equal(req.headers.get('origin'),'https://maxtravel.test');
    return Response.json({searchId,results:{searchResult:{tripInfos:{ONWARD:[flight]}}},rawSupplierCost:987654321});
  }});
  const result=await tools.run('search_flights',searchArgs);
  assert.deepEqual(submitted,{product:'FLIGHT',...searchArgs,children:0,infants:0,cabin:'ECONOMY'});
  assert.equal(result.cards[0].priceMinor,765432);assert.match(result.cards[0].basis!,/2 travellers/);
  assert.equal(result.cards[0].action.href,`/book?product=FLIGHT&flightSearch=${searchId}`);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|supplierMinor|987654321|auth=/);
  assert.equal(result.model.status,'ok');assert.match(String(result.model.notice),/compatibility/);
});

test('search cookies propagate between same-turn calls and back to browser, retaining guest ownership',async()=>{
  const {createMaxAiTools}=await compiled;const cookies:string[]=[];
  const tools=createMaxAiTools(request(),{now,dispatch:async(endpoint,req)=>{
    assert.equal(endpoint,'search');cookies.push(req.headers.get('cookie')??'');
    return Response.json({searchId,results:{searchResult:{tripInfos:{ONWARD:[flight]}}}},{headers:{'Set-Cookie':`maxtravel-shopping=token-${cookies.length}; Path=/api/travel; HttpOnly; SameSite=Lax`}});
  }});
  await tools.run('search_flights',searchArgs);await tools.run('search_flights',searchArgs);
  assert.deepEqual(cookies,['auth=PRIVATE_AUTH','auth=PRIVATE_AUTH; maxtravel-shopping=token-1']);
  assert.deepEqual(tools.cookies(),['maxtravel-shopping=token-2; Path=/api/travel; HttpOnly; SameSite=Lax']);
});

test('flight follow-up refinements filter actual customer prices/carriers and keep overnight arrival date',async()=>{
  const {createMaxAiTools}=await compiled;
  const option=(airline:string,price:number|null,hour:string,duration:number)=>({...flight,sI:[{...flight.sI[0],dt:`2026-12-01T${hour}:00:00`,at:'2026-12-02T01:00:00',duration,fD:{...flight.sI[0].fD,aI:{name:airline,code:'6E'}}}],totalPriceList:[{...flight.totalPriceList[0],customerEstimateMinor:price}]});
  const tools=createMaxAiTools(request(),{now,dispatch:async()=>Response.json({searchId,results:{searchResult:{tripInfos:{ONWARD:[option('Synthetic Air',400000,'20',180),option('Synthetic Air',500000,'22',120),option('Other Air',100000,'19',100),option('Synthetic Air',null,'18',90)]}}}})});
  const result=await tools.run('search_flights',{...searchArgs,airlineQuery:'Synthetic Air',maxTotalRupees:5000,sort:'duration'});
  assert.deepEqual(result.cards.map(card=>card.priceMinor),[500000,400000]);
  assert.match(result.cards[0].details.join(' '),/Arrives 2 Dec 2026/);
  assert.deepEqual((result.model.criteria as Record<string,unknown>).sort,'duration');
  assert.doesNotMatch(JSON.stringify(result.cards),/Other Air/);
});

test('multi-city search preserves all legs and clearly reports unavailable COMBO duration/stop filtering',async()=>{
  const {createMaxAiTools}=await compiled;let submitted:unknown;
  const tools=createMaxAiTools(request(),{now,dispatch:async(_endpoint,req)=>{submitted=await req.json();return Response.json({searchId,results:{searchResult:{tripInfos:{COMBO:[flight]}}}});}});
  const legs=[{from:'BOM',to:'DEL',date:'2026-12-01'},{from:'DEL',to:'HYD',date:'2026-12-03'}];
  const result=await tools.run('search_flights',{...searchArgs,legs,nonstopOnly:true,sort:'duration'});
  assert.deepEqual((submitted as Record<string,unknown>).legs,legs);assert.deepEqual(result.model.unsupportedFilters,['nonstopOnly','durationSort']);
  assert.match(result.cards[0].details.join(' '),/Complete itinerary/);assert.doesNotMatch(result.cards[0].details.join(' '),/Non-stop/);
});

test('hotel tool preserves exact rooms and nationality, filters foreign properties and labels partial destination inventory',async()=>{
  const {createMaxAiTools}=await compiled;const calls:{endpoint:string;body:unknown}[]=[];
  const dispatch:MaxAiToolDispatch=async(endpoint,req)=>{
    calls.push({endpoint,body:req.method==='POST'?await req.json():null});
    if(endpoint==='nationalities')return Response.json({nationalities:[{countryId:'106',name:'India',code:'IN'}]});
    if(endpoint==='destinationHotels')return Response.json({hotelIds:['10001'],label:'Goa, India',hasMore:true,nextCursor:'0:1'});
    assert.equal(endpoint,'search');return Response.json({searchId,results:{hotels:[
      {tjHotelId:'10001',name:'Actual stay',customerEstimateMinor:808150,property:{address:'Public address',secret:'PRIVATE_PROPERTY'}},
      {tjHotelId:'99999',name:'Out of scope',customerEstimateMinor:1},
    ]}});
  };
  const tools=createMaxAiTools(request(),{now,dispatch});
  const result=await tools.run('search_hotels',{regionId:'56',checkIn:'2026-12-01',checkOut:'2026-12-03',rooms:[{adults:2,childAge:[7]},{adults:1,childAge:[]}],nationality:'106'});
  assert.deepEqual(calls.map(call=>call.endpoint),['nationalities','destinationHotels','search']);
  assert.deepEqual(calls[1].body,{regionId:'56'});
  assert.deepEqual((calls[2].body as Record<string,unknown>).rooms,[{adults:2,childAge:[7],children:1},{adults:1,childAge:[],children:0}]);
  assert.equal(result.cards.length,1);assert.equal(result.cards[0].priceMinor,808150);assert.match(result.cards[0].basis!,/2 rooms · 4 guests/);
  assert.equal(result.cards[0].action.href,`/book?product=HOTEL&browseSearch=${searchId}&stay=10001`);
  assert.equal(result.model.moreDestinationPages,true);assert.match(String(result.model.notice),/not all hotels/);
  assert.equal(new URL(result.actions[1].href,'https://maxtravel.test').searchParams.get('destinationCursor'),'0:0');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROPERTY|Out of scope/);
});

test('empty hotel mapping pages retain the actual continuation without skipping the initial provider page',async()=>{
  const {createMaxAiTools}=await compiled;const mappingInputs:unknown[]=[];
  const dispatch:MaxAiToolDispatch=async(endpoint,req)=>{
    if(endpoint==='nationalities')return Response.json({nationalities:[{countryId:'106',name:'India',code:'IN'}]});
    assert.equal(endpoint,'destinationHotels');mappingInputs.push(await req.json());
    return Response.json({hotelIds:[],label:'Goa, India',hasMore:true,nextCursor:'0:1'});
  };
  const tools=createMaxAiTools(request(),{now,dispatch});
  const args={regionId:'56',checkIn:'2026-12-01',checkOut:'2026-12-03',rooms:[{adults:2,childAge:[]}],nationality:'106'};
  const result=await tools.run('search_hotels',args);
  assert.deepEqual(mappingInputs,[{regionId:'56'}]);assert.equal(result.model.nextCursor,'0:1');
  assert.equal(result.model.moreDestinationPages,true);assert.equal(result.cards.length,0);
  assert.deepEqual(result.model.criteria,{...args,destination:'Goa, India'});
  const params=new URL(result.actions[0].href,'https://maxtravel.test').searchParams;
  assert.equal(params.get('destinationCursor'),'0:0');assert.equal(params.get('regionId'),'56');assert.equal(params.get('autoSearch'),'1');
  await tools.run('search_hotels',{...args,cursor:result.model.nextCursor});
  assert.deepEqual(mappingInputs[1],{regionId:'56',cursor:'0:1'});
});

test('private trip data remains in customer cards, never model context; unsigned customers receive no records',async()=>{
  const {createMaxAiTools}=await compiled;
  const tools=createMaxAiTools(request(),{dispatch:async(endpoint)=>{
    assert.equal(endpoint,'bookings');return Response.json({bookings:[{id:searchId,reference:'MT-PRIVATE123',product:'FLIGHT',status:'TICKETED',total_minor:'12345',itinerary_summary:{from:'BOM',to:'DEL',date:'2026-12-01',email:'private@example.test'},passengers:[{name:'PRIVATE_NAME'}]}]});
  }});
  const result=await tools.run('my_trips',{});
  assert.equal(result.cards[0].title,'MT-PRIVATE123');assert.equal(result.cards[0].action.href,`/my-trips/${searchId}`);
  assert.doesNotMatch(JSON.stringify(result.model),/MT-PRIVATE123|BOM|DEL|TICKETED|2026-12-01|12345|PRIVATE_NAME/);
  assert.doesNotMatch(JSON.stringify(result),/private@example|PRIVATE_NAME/);
  const unsigned=createMaxAiTools(request(),{dispatch:async()=>Response.json({error:'PRIVATE_ERROR'},{status:401})});
  const noAccess=await unsigned.run('my_trips',{});assert.equal(noAccess.model.status,'sign_in_required');assert.deepEqual(noAccess.cards,[]);assert.doesNotMatch(JSON.stringify(noAccess),/PRIVATE_ERROR/);
});

test('tool failures are bounded generic evidence and never leak upstream response details',async()=>{
  const {createMaxAiTools}=await compiled;
  for(const status of [400,403,429,500,503]){
    const tools=createMaxAiTools(request(),{now,dispatch:async()=>Response.json({error:'PRIVATE_PROVIDER_ERROR secret=token'},{status})});
    const result=await tools.run('search_flights',searchArgs);assert.equal(result.cards.length,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|secret=token/);
    assert.equal(result.model.status,status===403?'access_required':status===429?'rate_limited':'unavailable');
  }
});

test('company and travel-help facts use the public settings projection and distinguish captured payment from supplier confirmation',async()=>{
  const {createMaxAiTools}=await compiled;let providerCalls=0;
  const tools=createMaxAiTools(request(),{companyProfile:async()=>({...businessProfile,name:'Configured MaxTravel',email:'support@example.test',phoneE164:'+919111111111',privateCredential:'PRIVATE_COMPANY_KEY'}),
    dispatch:async()=>{providerCalls++;throw Error('No provider calls');}});
  const company=await tools.run('company_info',{});assert.equal((company.model.company as Record<string,unknown>).email,'support@example.test');
  assert.equal((company.model.company as Record<string,unknown>).name,'Configured MaxTravel');assert.doesNotMatch(JSON.stringify(company),/PRIVATE_COMPANY_KEY/);
  const help=await tools.run('travel_help',{topic:'booking_confirmation'});
  assert.match(JSON.stringify(help.model.guidance),/captured payment does not establish/);assert.match(String(help.model.notice),/Payment receipt never establishes/);
  assert.equal(providerCalls,0);assert.ok(help.actions.every(action=>isMaxAiActionHref(action.href)));
});

test('aborted tool turns never start another application request',async()=>{
  const {createMaxAiTools}=await compiled;let calls=0;const controller=new AbortController();controller.abort();
  const req=new Request(request(),{signal:controller.signal});
  const tools=createMaxAiTools(req,{now,dispatch:async()=>{calls++;throw Error('Must not dispatch');}});
  assert.equal((await tools.run('search_flights',searchArgs)).model.status,'unavailable');assert.equal(calls,0);
});

test('trusted action URLs cannot navigate to arbitrary sites, API writes, script URLs or encoded paths',()=>{
  for(const href of ['/book?product=FLIGHT&flightSearch='+searchId,'/my-trips/'+searchId,'/packages/goa-break','/operations/promos','/account?returnTo=%2Fmy-trips'])assert.equal(isMaxAiActionHref(href),true,href);
  for(const href of ['https://evil.test','//evil.test','javascript:alert(1)','/api/payments/create','/api/admin/users','/book?evil=1','/book?product=FLIGHT&product=HOTEL','/my-trips/%2e%2e/account','/account?returnTo=https%3A%2F%2Fevil.test','/book#fake'])assert.equal(isMaxAiActionHref(href),false,href);
});

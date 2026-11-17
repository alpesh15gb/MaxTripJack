import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let serial=0;
async function harness(){
 const state={queries:[] as {sql:string;args:unknown[]}[],supplier:[] as unknown[],regions:['10','11'],known:true,result:{hotels:[{tjHotelId:'100'},{tjHotelId:'100'},{tjHotelId:'101'}],pageable:{totalPages:2}},access:0};
 const key=`__destination_route_${++serial}`,globals=globalThis as unknown as Record<string,unknown>;globals[key]=state;
 const prelude=`const state=globalThis[${JSON.stringify(key)}];`;
 const mocks:Record<string,string>={
  'next/navigation':'export function unstable_rethrow(){}',
  '@/lib/guest-shopping':`${prelude} export async function shoppingAccess(){state.access++;}`,
  '@/lib/db':`${prelude} export function database(){return {async query(sql,args){state.queries.push({sql,args});return sql.includes('SELECT name,country,label')?{rowCount:state.known?1:0,rows:[{name:'Aurangabad',country:'India',label:'Aurangabad, Maharashtra, India'}]}:{rows:state.regions.map(region_id=>({region_id}))};}}}`,
  '@/lib/providers/tripjack':`${prelude} export async function tripjack(product,path,input){state.supplier.push(input);return state.result;}`,
 };
 const output=await build({entryPoints:['src/app/api/travel/destination-hotels/route.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'boundaries',setup(builder){builder.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
 const compiled={exports:{} as {POST:(request:Request)=>Promise<Response>}};new Function('module','exports','require',output.outputFiles[0].text)(compiled,compiled.exports,require);
 const before=process.env.BETTER_AUTH_URL;process.env.BETTER_AUTH_URL='https://booking.example.test';
 return {state,call:(data:unknown={regionId:'10'},origin='https://booking.example.test')=>compiled.exports.POST(new Request('https://booking.example.test/api/travel/destination-hotels',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)})),cleanup(){delete globals[key];if(before===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=before;}};
}
test('a city lookup aggregates matching geographic regions in one bounded supplier request',async()=>{
 const h=await harness();try{
  const response=await h.call();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{hotelIds:['100','101'],nextCursor:'0:1',hasMore:true,regionId:'10',label:'Aurangabad, Maharashtra, India'});
  assert.deepEqual(h.state.supplier,[{regionIds:['10','11'],page:0,size:100}]);
  assert.deepEqual(h.state.queries[1].args,['Aurangabad','India','Aurangabad, Maharashtra, India']);
  assert.match(h.state.queries[1].sql,/lower\(trim\(label\)\)=lower\(trim\(\$3\)\)/);
  assert.equal(h.state.access,1);
 }finally{h.cleanup();}
});
test('bad origins, cursors and unknown catalogue regions never reach the supplier',async()=>{
 const h=await harness();try{
  assert.equal((await h.call({regionId:'10'},'https://other.example')).status,403);
  for(const input of [{regionId:'10',cursor:'1:0'},{regionId:'10',cursor:'20:0'},{regionId:'10',cursor:'-1:0'},{regionId:'10',regionIds:['11']}])assert.equal((await h.call(input)).status,400);
  h.state.known=false;assert.equal((await h.call()).status,404);
  assert.deepEqual(h.state.supplier,[]);
 }finally{h.cleanup();}
});

test('cached mapping still verifies access and the current destination before returning static IDs',async()=>{
 const h=await harness();try{
  const first=await h.call();assert.equal(first.status,200);const expected=await first.json();
  const second=await h.call();assert.equal(second.status,200);assert.deepEqual(await second.json(),expected);
  assert.equal(h.state.supplier.length,1);assert.equal(h.state.access,2);
  h.state.known=false;assert.equal((await h.call()).status,404);assert.equal(h.state.supplier.length,1);
 }finally{h.cleanup();}
});

test('legacy native numeric pages preserve their single-region contract without affecting web aggregation',async()=>{
 const h=await harness();try{
  h.state.result.pageable.totalPages=4;
  const response=await h.call({regionId:'10',page:2});assert.equal(response.status,200);
  assert.deepEqual(h.state.supplier,[{regionIds:['10'],page:2,size:100}]);
  const data=await response.json();assert.equal(data.page,2);assert.equal(data.hasMore,true);assert.deepEqual(data.hotelIds,['100','101']);
  assert.equal(h.state.queries.length,1);
  for(const input of [{regionId:'10',page:-1},{regionId:'10',page:501},{regionId:'10',page:0,cursor:'0:0'}])assert.equal((await h.call(input)).status,400);
  assert.equal(h.state.supplier.length,1);
  Object.assign(h.state.result,{hotels:Array.from({length:100},(_,index)=>({tjHotelId:String(index+1)})),pageable:undefined});
  const missingPagination=await h.call({regionId:'10',page:0});
  assert.equal((await missingPagination.json()).hasMore,false,'legacy default is a single page; web cursor calls remain conservative');
 }finally{h.cleanup();}
});

import test from 'node:test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {defaultCompanySettings,companySettingsSchema,profileFromSettings} from '../src/lib/company-settings-schema';
import {customerTotal} from '../src/lib/pricing-calculation';
import {getPublicPage} from '../src/lib/public-pages';
import {businessStructuredData} from '../src/lib/business-profile';

const changed={...defaultCompanySettings,tradingName:'Sample Travel',legalName:'Sample Travel Private Limited',email:'help@example.com',phone:'+919000000000',street:'12 Sample Road',city:'Pune',state:'Maharashtra',postalCode:'411001',opens:'10:00',closes:'18:00',days:['Monday'] as CompanyDays};
type CompanyDays=typeof defaultCompanySettings.days;
test('company settings reject unsafe or ambiguous public details',()=>{
 assert.ok(companySettingsSchema.safeParse(changed).success);
 for(const change of [{email:'a@b.com\r\nBcc: victim@example.com'},{phone:'javascript:alert(1)'},{mapsUrl:'javascript:alert(1)'},{mapsUrl:'https://user:password@example.com'},{opens:'18:00',closes:'10:00'},{days:[]},{gstNumber:'INVALID'},{logoDataUrl:'data:image/svg+xml;base64,AAAA'}])assert.equal(companySettingsSchema.safeParse({...changed,...change}).success,false);
});
test('saved business details reach public copy and structured data',()=>{
 const profile=profileFromSettings(changed),page=getPublicPage('office',profile)!;
 const text=JSON.stringify(page);assert.ok(text.includes('12 Sample Road'));assert.ok(text.includes('Pune'));assert.ok(text.includes('10:00 - 18:00'));assert.ok(!text.includes('Golden Hawk'));assert.ok(!text.includes('Secunderabad'));
 const graph=businessStructuredData(profile);assert.equal(graph.email,'help@example.com');assert.equal(graph.name,'Sample Travel');
});
test('markup and margin have different exact totals, fees apply once',()=>{
 const rule={markup_minor:5000,service_fee_minor:2500,markup_basis_points:1000};
 assert.equal(customerTotal(1000000,rule),1107500);
 assert.equal(customerTotal(1000000,{...rule,markup_basis_points:0,margin_basis_points:1000}),1118612);
 assert.equal(customerTotal(1,{...rule,markup_minor:0,service_fee_minor:0,markup_basis_points:0,margin_basis_points:1000}),2);
 assert.equal(customerTotal(101,{...rule,markup_minor:0,service_fee_minor:0,markup_basis_points:5000}),152);
 assert.throws(()=>customerTotal(100,{...rule,margin_basis_points:1000}));
 assert.throws(()=>customerTotal(100,{...rule,markup_basis_points:0,margin_basis_points:10000}));
 assert.throws(()=>customerTotal(Number.MAX_SAFE_INTEGER,rule));
});
async function bundle(entry:string,mocks:Record<string,string>){
 const built=await build({entryPoints:[resolve(entry)],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'test-boundaries',setup(p){p.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:undefined);p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
 const compiled={exports:{}};new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));return compiled.exports;
}
test('settings API enforces access, validates, rejects stale edits and audits a save',async()=>{
 const state={allowed:true,version:0,queries:[] as string[],settings:defaultCompanySettings};
 const key='__company_settings_test';(globalThis as unknown as Record<string,unknown>)[key]=state;
 const prefix=`const state=globalThis.${key};`;
 try{
 const api=await bundle('src/app/api/admin/company-settings/route.ts',{
  '@/lib/access':`${prefix} export async function administrator(req,permission){if(permission!=='companies:manage'||!state.allowed)throw Object.assign(new Error('Forbidden'),{status:403});return {userId:'admin'};}`,
  '@/lib/company-settings':`${prefix} export async function readCompanySettings(){return {settings:state.settings,version:state.version}}`,
  '@/lib/db':`${prefix} export async function transaction(fn){return fn({async query(sql,args){state.queries.push(sql);if(sql.startsWith('SELECT settings,version'))return {rows:state.version?[{version:state.version,settings:state.settings}]:[]};if(sql.startsWith('INSERT INTO company_settings')){state.settings=JSON.parse(args[0]);state.version++;return {rows:[{version:state.version,updated_at:'2026-11-16'}]};}return {rows:[]};}});}`,
  '@/lib/http':`export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}} export function sameOrigin(r){if(r.headers.get('origin')!=='https://maxtravel.in')throw new HttpError(403,'Origin rejected');} export const boundedText=(r)=>r.text();export const json=(d)=>Response.json(d);export const failure=(e)=>Response.json({error:e.message},{status:e.status||400});`,
 }) as {GET:(r:Request)=>Promise<Response>;PUT:(r:Request)=>Promise<Response>};
 const request=(version:number,settings:unknown=changed,origin='https://maxtravel.in')=>new Request('https://maxtravel.in/api/admin/company-settings',{method:'PUT',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({version,settings})});
 state.allowed=false;assert.equal((await api.PUT(request(0))).status,403);assert.equal(state.queries.length,0);
 state.allowed=true;assert.equal((await api.PUT(request(0,changed,'https://elsewhere.example'))).status,403);
 assert.equal((await api.PUT(request(0,{...changed,logoDataUrl:'data:image/png;base64,AAAA'}))).status,400);
 assert.equal((await api.PUT(request(0))).status,200);assert.equal(state.version,1);assert.ok(state.queries.some(q=>q.includes('audit_events')));
 assert.equal((await api.PUT(request(0))).status,409);assert.equal(state.version,1);
 assert.equal((await (await api.GET(new Request('https://maxtravel.in'))).json()).settings.email,'help@example.com');
 const jpeg=await sharp({create:{width:900,height:300,channels:3,background:'#006756'}}).jpeg().toBuffer();
 const logoResponse=await api.PUT(request(1,{...changed,logoDataUrl:`data:image/jpeg;base64,${jpeg.toString('base64')}`}));assert.equal(logoResponse.status,200);
 const saved=await logoResponse.json();assert.ok(saved.settings.logoDataUrl.startsWith('data:image/png;base64,'));
 const logo=await sharp(Buffer.from(saved.settings.logoDataUrl.split(',')[1],'base64')).metadata();assert.equal(logo.width,600);assert.equal(logo.height,200);

 }finally{delete (globalThis as unknown as Record<string,unknown>)[key];}
});
test('outgoing mail uses saved reply-to and signature but retains the configured SMTP sender',async()=>{
 const key='__company_mail_test';const state:{message?:{from:string;replyTo:string;text:string}}={};(globalThis as unknown as Record<string,unknown>)[key]=state;
 const previous={host:process.env.SMTP_HOST,from:process.env.MAIL_FROM};process.env.SMTP_HOST='smtp.example.com';process.env.MAIL_FROM='verified@example.com';
 try{const mail=await bundle('src/lib/mail.ts',{'server-only':'','./company-settings':`export async function getCompanyProfile(){return ${JSON.stringify(profileFromSettings(changed))};}`,'./bounded-mail':`export async function boundedMail(options,message){globalThis.${key}.message=message;}`}) as {sendMail:(to:string,subject:string,text:string)=>Promise<void>};
 await mail.sendMail('guest@example.com','Test','Your booking is confirmed.');assert.equal(state.message?.from,'verified@example.com');assert.equal(state.message?.replyTo,'help@example.com');assert.ok(state.message?.text.includes('Sample Travel Private Limited'));assert.ok(state.message?.text.includes('12 Sample Road'));assert.ok(state.message?.text.includes('10:00 - 18:00'));
 }finally{if(previous.host===undefined)delete process.env.SMTP_HOST;else process.env.SMTP_HOST=previous.host;if(previous.from===undefined)delete process.env.MAIL_FROM;else process.env.MAIL_FROM=previous.from;delete (globalThis as unknown as Record<string,unknown>)[key];}
});

import test from "node:test";
import PDFDocument from "pdfkit";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Exercise the actual renderer with synthetic DB/vault/PDF boundaries. No travel or mail actions.
const documentCases: {product:string;status:string;serviceKind?:string;title?:string}[] = [
  {product:'FLIGHT',status:'TICKETED',title:'Booking confirmation'},
  {product:'HOTEL',status:'CONFIRMED',title:'Hotel confirmation voucher'},
  {product:'FLIGHT',status:'CONFIRMED'},
  {product:'HOTEL',status:'TICKETED'},
  {product:'FLIGHT',status:'PAID'},
  {product:'OTHER',status:'TICKETED'},
  {product:'FLIGHT',status:'CONFIRMED',serviceKind:'ANCILLARY',title:'Flight extras confirmation'},
  {product:'FLIGHT',status:'TICKETED',serviceKind:'ANCILLARY',title:'Flight extras confirmation'},
  {product:'FLIGHT',status:'BOOKING_PENDING',serviceKind:'ANCILLARY'},
  {product:'FLIGHT',status:'TICKETED',serviceKind:'REISSUE',title:'Replacement flight confirmation'},
  {product:'FLIGHT',status:'CONFIRMED',serviceKind:'REISSUE'},
  ...[{product:'FLIGHT'},{product:'HOTEL'},{product:'FLIGHT',serviceKind:'ANCILLARY'},{product:'FLIGHT',serviceKind:'REISSUE'}].map(value=>({...value,status:'CANCELLED',title:'Cancelled booking record'})),
];
for (const scenario of documentCases) test(`document truthful state and exact amounts: ${scenario.product} ${scenario.serviceKind??'BASE'} ${scenario.status}`, async () => {
  const {status,product,serviceKind,title}=scenario;
  const state = { text: [] as string[], queries:[] as string[], unsealed:0, status, product, serviceKind, PDFDocument };
  const key = `__document_test_${product}_${serviceKind??'BASE'}_${status}`;
  (globalThis as unknown as Record<string, unknown>)[key] = state;
  const prefix = `const state=globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string,string> = {
    "./company-settings": `import {defaultCompanySettings,profileFromSettings} from "./src/lib/company-settings-schema"; export async function getCompanyProfile(){return profileFromSettings({...defaultCompanySettings,tradingName:"Voucher Test Travel",email:"support@example.com"});}`,
    "@/lib/db": `${prefix} export function database(){return {async query(sql){
      state.queries.push(sql);
      if(sql.includes('SELECT * FROM orders'))return {rows:[{id:'synthetic',reference:'SYNTHETIC',status:state.status,product:state.product,service_kind:state.serviceKind,total_minor:'9007199254740993',created_at:'2026-10-01',updated_at:'2026-10-25',itinerary_summary:{from:'BOM',to:'DEL',date:'2026-11-01'}}]};
      if(sql.includes('supplier_quotes'))return {rows:[{review:{option:{mealBasis:'Breakfast included',roomInfo:[{name:'Deluxe room'}],inclusions:['Wi-Fi'],bookingNotes:'Photo ID required.',cancellation:{isRefundable:false},privateSecret:'NEVER_EXPOSE'}}}]};
      if(sql.includes('cancellation_requests'))return {rowCount:1,rows:[{is_partial:false,refund_offer_minor:'9007199254740991',scope:{trips:[]}},{is_partial:true,refund_offer_minor:null,scope:{trips:[]}}]};
      return {rows:[]};
    }}}`,
    "@/lib/vault": `${prefix} export function unseal(){state.unsealed++;return {travellers:[]};}`,
    "pdfkit": `${prefix} const RealPDF=state.PDFDocument; export default class PDF extends RealPDF {
      text(value,...args){state.text.push(value);return super.text(value,...args)}
    }`,
  };
  try {
    const built = await build({entryPoints:[resolve('src/lib/booking-document.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'document-boundaries',setup(p){p.onResolve({filter:/.*/},a => Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:undefined);p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
    const compiled = {exports:{} as {bookingDocument:(id:string)=>Promise<Response>}};
    new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
    if(!title){
      await assert.rejects(compiled.exports.bookingDocument('synthetic'),{status:409,message:'Confirmation is available after the supplier confirms the booking.'});
      assert.deepEqual(state.text,[]);assert.equal(state.unsealed,0);assert.equal(state.queries.length,1);return;
    }
    const response = await compiled.exports.bookingDocument('synthetic');
    assert.ok(state.text.includes(title));
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.equal(response.headers.get('Content-Type'),'application/pdf');
    assert.ok(state.text.some(t=>t.includes('Voucher Test Travel')));assert.ok(state.text.some(t=>t.includes('support@example.com')));
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    assert.ok(state.text.includes('Booking amount: INR 90071992547409.93'));
    assert.ok(state.text.some(t=>t.includes('Agreed refund: INR 90071992547409.91')));
    assert.ok(state.text.some(t=>t.includes('Agreed refund amount unavailable')));
    assert.ok(state.text.includes('Partial cancellation confirmed for the travellers and segments below.'));
    assert.ok(!state.text.some(t=>t.includes('remaining travel stays active')));
    if(status==='CANCELLED'){assert.ok(state.text.includes('Cancelled booking record'));assert.ok(state.text.some(t=>t.includes('not valid for travel')&&t.includes('does not confirm that a refund has completed')));}
    else if(product==='HOTEL'){assert.ok(state.text.includes('Breakfast included'));assert.ok(state.text.includes('Deluxe room'));assert.ok(state.text.includes('Photo ID required.'));assert.ok(state.text.some(t=>t.includes('non-refundable')));assert.ok(!state.text.some(t=>t.includes('NEVER_EXPOSE')));}
  } finally {delete (globalThis as unknown as Record<string,unknown>)[key];}
});

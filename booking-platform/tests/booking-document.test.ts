import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Exercise the actual renderer with synthetic DB/vault/PDF boundaries. No travel or mail actions.
for (const status of ["CANCELLED", "TICKETED", "PAID"]) test(`document truthful state and exact amounts: ${status}`, async () => {
  const state = { text: [] as string[], status };
  const key = `__document_test_${status}`;
  (globalThis as unknown as Record<string, unknown>)[key] = state;
  const prefix = `const state=globalThis[${JSON.stringify(key)}];`;
  const mocks: Record<string,string> = {
    "@/lib/db": `${prefix} export function database(){return {async query(sql){
      if(sql.includes('SELECT * FROM orders'))return {rows:[{id:'synthetic',reference:'SYNTHETIC',status:state.status,product:'FLIGHT',total_minor:'9007199254740993',created_at:'2026-10-01',updated_at:'2026-10-25',itinerary_summary:{from:'BOM',to:'DEL',date:'2026-11-01'}}]};
      if(sql.includes('cancellation_requests'))return {rowCount:1,rows:[{is_partial:false,refund_offer_minor:'9007199254740991',scope:{trips:[]}},{is_partial:true,refund_offer_minor:null,scope:{trips:[]}}]};
      return {rows:[]};
    }}}`,
    "@/lib/vault": `export function unseal(){return {travellers:[]};}`,
    "pdfkit": `${prefix} import {EventEmitter} from 'node:events'; export default class PDF extends EventEmitter {
      fillColor(){return this} fontSize(){return this} moveDown(){return this}
      text(value){state.text.push(value);return this} end(){this.emit('data',Buffer.from('synthetic-pdf'));this.emit('end')}
    }`,
  };
  try {
    const built = await build({entryPoints:[resolve('src/lib/booking-document.ts')],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'document-boundaries',setup(p){p.onResolve({filter:/.*/},a => Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:undefined);p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
    const compiled = {exports:{} as {bookingDocument:(id:string)=>Promise<Response>}};
    new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
    if(status==='PAID'){await assert.rejects(compiled.exports.bookingDocument('synthetic'),/after the supplier confirms/);assert.deepEqual(state.text,[]);return;}
    const response = await compiled.exports.bookingDocument('synthetic');
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.ok(state.text.includes('Booking amount: INR 90071992547409.93'));
    assert.ok(state.text.some(t=>t.includes('Agreed refund: INR 90071992547409.91')));
    assert.ok(state.text.some(t=>t.includes('Agreed refund amount unavailable')));
    assert.ok(state.text.includes('Partial cancellation confirmed for the travellers and segments below.'));
    assert.ok(!state.text.some(t=>t.includes('remaining travel stays active')));
    if(status==='CANCELLED'){assert.ok(state.text.includes('Cancelled booking record'));assert.ok(state.text.some(t=>t.includes('not valid for travel')&&t.includes('does not confirm that a refund has completed')));}
    else assert.ok(state.text.includes('Booking confirmation'));
  } finally {delete (globalThis as unknown as Record<string,unknown>)[key];}
});

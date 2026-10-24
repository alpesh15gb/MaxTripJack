import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { serviceConditions } from '../src/service-conditions.ts';
import { serviceConditions as webConditions } from '../../booking-platform/src/lib/service-conditions.ts';

const valid={version:1,blocked:false,lines:[
 {label:'Supplier quote validity (seconds)',text:'180'},
 {label:'Service restriction',text:'Extras cannot be refunded'},
 {label:'Supplier notice',text:'Seat eligibility still applies'},
]};
const unsafe=[undefined,null,[],{}, {conditions:{st:180},alerts:['PRIVATE_SUPPLIER_VALUE']},
 {...valid,version:2}, {...valid,blocked:'false'}, {...valid,extra:'PRIVATE_SUPPLIER_VALUE'},
 {...valid,lines:[{label:['Supplier notice'],text:'PRIVATE_SUPPLIER_VALUE'}]}, {...valid,lines:null}, {...valid,lines:[null]}, {...valid,lines:[{label:'Commission',text:'PRIVATE_SUPPLIER_VALUE'}]},
 {...valid,lines:[{label:'Supplier notice',text:{secret:'PRIVATE_SUPPLIER_VALUE'}}]},
 {...valid,lines:[{label:'Supplier notice',text:'safe',secret:'PRIVATE_SUPPLIER_VALUE'}]},
 {...valid,lines:[{label:'Supplier notice',text:''}]},
 {...valid,lines:[{label:'Supplier notice',text:'x'.repeat(2001)}]},
 {...valid,lines:[{label:'Supplier notice',text:'unsafe\u0000text'}]},
 {...valid,lines:Array(51).fill(valid.lines[0])},
 {...valid,blocked:true,lines:[{label:'Supplier notice',text:'PRIVATE_SUPPLIER_VALUE'}]},
];
test('native service DTO preserves supported labelled terms without supplier JSON',()=>{
 const parsed=serviceConditions(valid);
 assert.equal(parsed.blocked,false);
 assert.deepEqual(parsed.lines,valid.lines);
});
test('native and web strictly refuse the same malformed, unsupported or missing disclosures',()=>{
 for(const review of [valid,{version:1,blocked:true,lines:[]},...unsafe])assert.deepEqual(serviceConditions(review),webConditions(review));
 for(const review of unsafe){
  const parsed=serviceConditions(review);
  assert.equal(parsed.blocked,true);
  assert.deepEqual(parsed.lines,[]);
  assert.doesNotMatch(JSON.stringify(parsed),/PRIVATE_SUPPLIER_VALUE/);
 }
});
test('native confirmation guard precedes recovery persistence and every payment call',()=>{
 const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 const service=app.slice(app.indexOf('function NativeFlightServices('),app.indexOf('function NativeApp('));
 assert.match(service,/const conditions=serviceConditions\(quote\?\.review\)/);
 assert.doesNotMatch(service,/JSON\.stringify\(quote.review/);
 assert.match(service,/conditions\.lines\.map/);
 assert.match(service,/disabled=\{busy\|\|!consent\|\|paymentSafety.blocked\|\|conditions.blocked\}/);
 const guard=service.indexOf('if(conditions.blocked)throw Error(');
 assert.ok(guard>0);
 assert.ok(guard<service.indexOf('await paymentSafety.start('));
 assert.ok(guard<service.indexOf('"/api/payments/create"'));
 assert.match(service,/Confirmation is unavailable; contact support/);
});

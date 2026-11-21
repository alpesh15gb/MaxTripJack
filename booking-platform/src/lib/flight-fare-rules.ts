import type {ReviewTerm} from './review-term-changes';

export const flightRuleTypes = ['CANCELLATION', 'DATECHANGE', 'NO_SHOW', 'SEAT_CHARGEABLE'] as const;
export type FlightRuleType = typeof flightRuleTypes[number];
export const flightRuleLabels:Record<FlightRuleType,string> = {
 CANCELLATION:'Cancellation', DATECHANGE:'Date changes', NO_SHOW:'No-show', SEAT_CHARGEABLE:'Seat charges',
};
export const flightFeeLabels = {
 ACF:'Airline cancellation fee', ACFT:'Tax on airline cancellation fee', CCF:'Supplier cancellation fee', CCFT:'Tax on supplier cancellation fee',
 ARF:'Airline change fee', ARFT:'Tax on airline change fee', CRF:'Supplier change fee', CRFT:'Tax on supplier change fee',
} as const;
export type FlightRule = {amount?:number;additionalFee?:number;policyInfo?:string;st?:number;et?:number;pp?:'BEFORE_DEPARTURE'|'AFTER_DEPARTURE'|'DEFAULT';fcs?:Partial<Record<keyof typeof flightFeeLabels,number>>};
export type FlightRuleRoute = {tfr?:Partial<Record<FlightRuleType,FlightRule[]>>;miscInfo?:string[]};
type FareRule = {miscInfo?:string}&Record<string,FlightRuleRoute|string|undefined>;
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const routePattern=/^[A-Z]{3}(?:-[A-Z]{3}){1,7}$/;

/** Cat 16 notes can exceed the short hotel-policy text limit. Keep complete text,
 * never HTML, partial clauses, arbitrary supplier fields or document IDs. */
function ruleText(value:unknown,max=20000):string|null {
 return typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)?value.trim()||null:null;
}
function number(value:unknown,max=Number.MAX_SAFE_INTEGER):number|null {
 const parsed=typeof value==='number'?value:typeof value==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)?Number(value):NaN;
 return Number.isFinite(parsed)&&parsed>=0&&parsed<=max?parsed:null;
}
function notes(value:unknown):string[]|null {
 const rows=typeof value==='string'?[value]:value;
 if(!Array.isArray(rows)||!rows.length||rows.length>20)return null;
 const clean=rows.map(value=>ruleText(value));
 return clean.every((value):value is string=>value!==null)&&clean.join('').length<=80000?clean:null;
}
function rule(source:unknown):FlightRule|null {
 const raw=object(source),result:FlightRule={};
 if(raw.st!==undefined||raw.et!==undefined){
  const st=number(raw.st,8760),et=number(raw.et,8760);
  if(st===null||et===null||et<st||raw.pp!==undefined)return null;
  result.st=st;result.et=et;
 }else if(raw.pp!==undefined){
  if(!['BEFORE_DEPARTURE','AFTER_DEPARTURE','DEFAULT'].includes(raw.pp as string))return null;
  result.pp=raw.pp as FlightRule['pp'];
 }
 for(const key of ['amount','additionalFee'] as const){
  if(raw[key]===undefined)continue;
  const value=number(raw[key]);if(value===null)return null;result[key]=value;
 }
 if(raw.policyInfo!==undefined&&raw.policyInfo!==''){
  const info=ruleText(raw.policyInfo,2000);if(info===null)return null;result.policyInfo=info;
 }
 const fcs=object(raw.fcs),fees:NonNullable<FlightRule['fcs']>={};
 for(const key of Object.keys(flightFeeLabels) as (keyof typeof flightFeeLabels)[]){
  if(fcs[key]===undefined)continue;
  const value=number(fcs[key]);if(value===null)return null;fees[key]=value;
 }
 if(Object.keys(fees).length)result.fcs=fees;
 // A timing band by itself does not say whether an action is allowed or free.
 return result.policyInfo!==undefined||result.amount!==undefined||result.additionalFee!==undefined||result.fcs?result:null;
}

/** Official /fms/v2/farerule response: fareRule[route].tfr[type][] or
 * fareRule[route].miscInfo[]. See docs/audits/flight-fare-rules.md.
 * Explicit field projection is also idempotent for previously projected reviews. */
export function publicFlightFareRule(source:unknown):FareRule|null {
 const raw=object(object(source).fareRule),out:FareRule={};
 const legacy=ruleText(raw.miscInfo,2000);if(legacy)out.miscInfo=legacy;
 const routes=Object.entries(raw).filter(([key])=>routePattern.test(key));
 if(routes.length>12)return legacy?{miscInfo:legacy}:null;
 for(const [route,value] of routes){
  const entry=object(value),tfr=object(entry.tfr),clean:FlightRuleRoute={},policies:NonNullable<FlightRuleRoute['tfr']>={};
  for(const type of flightRuleTypes){
   const rows=tfr[type];if(!Array.isArray(rows)||!rows.length||rows.length>40)continue;
   const rules=rows.map(rule);
   // Do not silently turn a partially understood time-band list into a complete policy.
   if(rules.every((value):value is FlightRule=>value!==null))policies[type]=rules;
  }
  if(Object.keys(policies).length)clean.tfr=policies;
  const info=notes(entry.miscInfo);if(info)clean.miscInfo=info;
  // Preserve a recognized route even if no rule can be safely projected, so the
  // customer sees that route's missing cancellation conditions explicitly.
  out[route]=clean;
 }
 return Object.keys(out).length?out:null;
}

export function flightFareRuleRoutes(source:unknown):{route:string;policy:FlightRuleRoute}[]{
 const rules=publicFlightFareRule(source);
 return rules?Object.entries(rules).filter(([route])=>routePattern.test(route)).sort(([a],[b])=>a.localeCompare(b)).map(([route,policy])=>({route,policy:policy as FlightRuleRoute})):[];
}

export function scopeFlightFareRules(source:unknown,routes:ReadonlySet<string>){
 const raw=object(source);
 const rules=object(raw.fareRule);
 if(!Object.keys(rules).length)return source;
 return {...raw,fareRule:Object.fromEntries(Object.entries(rules).filter(([key])=>key==='miscInfo'||routes.has(key)))};
}
export function flightRuleWindow(rule:FlightRule):string {
 if(rule.st!==undefined&&rule.et!==undefined)return `${rule.st}–${rule.et} hours before departure`;
 if(rule.pp==='BEFORE_DEPARTURE')return 'Before departure';
 if(rule.pp==='AFTER_DEPARTURE')return 'After departure';
 if(rule.pp==='DEFAULT')return 'General policy';
 return 'Timing not supplied';
}
export function hasFlightCancellationRules(source:unknown):boolean {
 const rules=publicFlightFareRule(source),routes=flightFareRuleRoutes(source);
 return routes.length>0?routes.every(({policy})=>Boolean(policy.tfr?.CANCELLATION?.length)):typeof rules?.miscInfo==='string';
}
export function flightRuleDescription(rule:FlightRule):string {
 const amounts=[rule.amount!==undefined?`Airline fee ${rule.amount}`:null,rule.additionalFee!==undefined?`Supplier fee ${rule.additionalFee}`:null].filter(Boolean);
 const fees=Object.entries(rule.fcs??{}).map(([key,value])=>`${flightFeeLabels[key as keyof typeof flightFeeLabels]} ${value}`);
 return [flightRuleWindow(rule),rule.policyInfo,...amounts,...fees,amounts.length||fees.length?'Currency and per-person basis not supplied':null].filter(Boolean).join(' · ');
}
export function flightFareRuleTerms(source:unknown):ReviewTerm[]{
 const rules=publicFlightFareRule(source),rows:ReviewTerm[]=[],legacy=typeof rules?.miscInfo==='string'?rules.miscInfo:null;
 const routes=flightFareRuleRoutes(source);
 if(legacy||!routes.length)rows.push({key:'fareRules.miscInfo',label:'Fare rule notes',value:legacy});
 for(const {route,policy} of routes){
  for(const type of flightRuleTypes){
   const entries=policy.tfr?.[type];
   // Always compare cancellation availability. Other absent categories are not
   // inferred restrictions; if supplied later they become a visible change.
   if(!entries&&type!=='CANCELLATION')continue;
   const canonical=entries?.map(entry=>JSON.stringify(entry)).sort();
   rows.push({key:`fareRules.${route}.${type}`,label:`${route.replaceAll('-',' → ')} · ${flightRuleLabels[type]}`,value:canonical?JSON.stringify(canonical):null,...(entries?{display:entries.map(flightRuleDescription).join('; ')}:{})});
  }
  if(policy.miscInfo)rows.push({key:`fareRules.${route}.notes`,label:`${route.replaceAll('-',' → ')} · Fare rule notes`,value:policy.miscInfo.join('\n\n')});
 }
 return rows;
}

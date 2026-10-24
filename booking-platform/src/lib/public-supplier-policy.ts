import {hotelCancellation,hotelObject} from './hotel-presentation';
/** No truncation: partial text must not look like a complete supplier rule. */
export function policyText(value:unknown):string|null {
 if(typeof value!=='string'||value.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return null;
 return value.trim()||null;
}
/** Fail closed on unsupported schemas. Never recursively expose supplier payloads,
 * credentials, IDs, status objects, commission or net-fare accounting. Shared by
 * the public review boundary and renderer (defence against old cached responses).
 * These are the existing fixture-backed policy shapes, not a general key filter. */
export function publicSupplierPolicy(source:unknown):Record<string,unknown>|null {
 const raw=hotelObject(source),out:Record<string,unknown>={};
 const note=policyText(source);if(note)out.policyText=note;
 for(const key of ['policyText','policy','cancellation'] as const){const value=policyText(raw[key]);if(value)out[key]=value;}
 const misc=policyText(hotelObject(raw.fareRule).miscInfo);if(misc)out.fareRule={miscInfo:misc};
 const policy=hotelCancellation(raw);
 if(typeof policy.isRefundable==='boolean')out.isRefundable=policy.isRefundable;
 if(Array.isArray(raw.penalties)&&raw.penalties.length>0&&raw.penalties.length<=40&&policy.penalties.length===raw.penalties.length)out.penalties=policy.penalties;
 // deadlineDateTime is not a free-cancellation promise. Preserve its supplier name.
 if(policy.deadlineDateTime)out.deadlineDateTime=policy.deadlineDateTime;
 return Object.keys(out).length?out:null;
}
/** Alerts have no established nested public schema. Keep only complete text. */
export function publicSupplierAlerts(source:unknown):string|string[]|null {
 const single=policyText(source);if(single)return single;
 if(!Array.isArray(source)||source.length===0||source.length>20)return null;
 const values=source.map(policyText);return values.every((value):value is string=>value!==null)?values:null;
}

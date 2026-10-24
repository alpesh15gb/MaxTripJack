import {hotelObject} from './hotel-presentation';

// Match the existing server validator's truthiness, including malformed supplier
// flag values, without returning those values (which may contain private objects).
// Missing flags remain missing: absence is not a promise of no requirements.
function flags<K extends string>(source:unknown,keys:readonly K[]):Partial<Record<K,boolean>>{
 const raw=hotelObject(source),out:Partial<Record<K,boolean>>={};
 for(const key of keys)if(Object.hasOwn(raw,key))out[key]=Boolean(raw[key]);
 return out;
}
export function publicReviewConditions(source:unknown){
 const raw=hotelObject(source);
 return {...flags(raw,['iecr','ipa']),pcs:flags(raw.pcs,['pm','pped']),dob:flags(raw.dob,['adobr','cdobr','idobr']),gst:flags(raw.gst,['igm'])};
}
export function publicReviewCompliance(source:unknown){
 const raw=hotelObject(source);
 // Preserve exact comparison semantics for PASSTHROUGH / RESELLER. Do not trim
 // or invent an exhaustive enum. Unsupported values are unavailable, not “NA”.
 const gstType=typeof raw.gstType==='string'&&raw.gstType.length<=80&&!/[\u0000-\u001f]/.test(raw.gstType)?raw.gstType:undefined;
 return {...flags(raw,['passportRequired','panRequired']),...(gstType!==undefined?{gstType}:{})};
}

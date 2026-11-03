/** Last supplier-reported arrival day, never a guessed flight departure day. */
export function crmTravelEnd(product:string,criteria:Record<string,unknown>,...sources:unknown[]):string|null {
 const day=(value:unknown)=>{if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return null;const d=value.slice(0,10),n=new Date(d+"T00:00:00Z");return Number.isFinite(n.getTime())&&n.toISOString().slice(0,10)===d?d:null;};
 if(product==="HOTEL")return day(criteria.checkOut);
 const arrivals:string[]=[],seen=new Set<object>();let incomplete=false;
 const visit=(value:unknown)=>{if(!value||typeof value!=="object"||seen.has(value))return;seen.add(value);if(Array.isArray(value)){value.forEach(visit);return;}const row=value as Record<string,unknown>;if(Array.isArray(row.sI)){for(const segment of row.sI){const arrival=day(segment?.at);if(arrival)arrivals.push(arrival);else incomplete=true;}}for(const [key,item] of Object.entries(row))if(key!=="sI")visit(item);};
 sources.forEach(visit);if(incomplete||!arrivals.length)return null;
 const requested=[day(criteria.date),day(criteria.returnDate),...(Array.isArray(criteria.legs)?criteria.legs.map(leg=>day(leg?.date)):[])].filter((d):d is string=>!!d).sort();
 const end=arrivals.sort().at(-1)!;return requested.length&&end<requested.at(-1)!?null:end;
}

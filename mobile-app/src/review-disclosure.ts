// Explicit display contract also protects against older cached API responses.
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function text(value:unknown):string|null{return typeof value==='string'&&value.length<=2000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)?value.trim()||null:null;}
function list(value:unknown):string|null{if(!Array.isArray(value)||!value.length||value.length>20)return null;const rows=value.map(text);return rows.every(row=>row!==null)?rows.join(' · '):null;}
export function policyDisclosure(source:unknown):string{
 const raw=object(source),rows:string[]=[];
 for(const [label,value] of [['Policy',typeof source==='string'?source:raw.policyText],['Policy notes',raw.policy],['Cancellation',raw.cancellation],['Fare rule notes',object(raw.fareRule).miscInfo],['Supplier deadline',raw.deadlineDateTime]]){const safe=text(value);if(safe)rows.push(`${label}: ${safe}`);}
 if(typeof raw.isRefundable==='boolean')rows.push(raw.isRefundable?'Refundable · policy charges may apply':'Non-refundable');
 if(Array.isArray(raw.penalties)&&raw.penalties.length>0&&raw.penalties.length<=40){
  const penalties=raw.penalties.map(value=>{const row=object(value),from=text(row.from),to=text(row.to);return from&&to&&typeof row.amount==='number'&&Number.isFinite(row.amount)&&row.amount>=0?`${from} to ${to}: supplier amount ${row.amount} (currency, units and basis unverified)`:null;});
  if(penalties.every(row=>row!==null))rows.push(`Cancellation schedule: ${penalties.join('; ')}`);
 }
 rows.push('Other terms may be unavailable. Missing details do not mean no restrictions.');return rows.join('\n');
}
export function reviewDisclosure(source:unknown):string{
 const review=object(source),option=object(review.option),conditions=object(review.conditions),compliance=object(option.compliance),rows:string[]=[];
 const add=(label:string,value:unknown)=>{const safe=text(value);if(safe)rows.push(`${label}: ${safe}`);};
 if(Array.isArray(option.roomInfo)&&option.roomInfo.length<=4)add('Rooms',list(option.roomInfo.map(room=>object(room).name)));
 add('Meal plan',option.mealBasis);add('Option type',option.optionType);add('Inclusions',list(option.inclusions));add('Booking notes',option.bookingNotes);
 const flags:[string,unknown][]=[['Passport',object(conditions.pcs).pm||compliance.passportRequired],['Passport expiry',object(conditions.pcs).pped||object(conditions.pcs).pm||compliance.passportRequired],['Adult date of birth',object(conditions.dob).adobr],['Child date of birth',object(conditions.dob).cdobr],['Infant date of birth',object(conditions.dob).idobr],['Adult PAN',conditions.ipa||compliance.panRequired],['GST information',object(conditions.gst).igm||['PASSTHROUGH','RESELLER'].includes(compliance.gstType as string)],['Emergency contact',conditions.iecr]];
 for(const [label,value] of flags)if(value)rows.push(`${label}: required`);
 add('GST type',typeof compliance.gstType==='string'&&compliance.gstType.length<=80?compliance.gstType:null);
 rows.push(`Fare rules: ${policyDisclosure(review.fareRules)}`);
 if(review.option)rows.push(`Room cancellation: ${policyDisclosure(option.cancellation)}`);
 add('Alerts',text(review.alerts)||list(review.alerts));
 rows.push('Requirements not listed may be unavailable; final validation still applies.');return rows.join('\n');
}

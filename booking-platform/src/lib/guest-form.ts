import type { GuestIssue } from './guest-validation-rules';

const travellerFields:Record<string,{name:string;label:string}>={ti:{name:'title',label:'Title'},fN:{name:'first',label:'First name'},lN:{name:'last',label:'Last name'},dob:{name:'dob',label:'Date of birth'},pNum:{name:'passport',label:'Passport number'},eD:{name:'expiry',label:'Passport expiry'},pNat:{name:'nationality',label:'Passport nationality'},pan:{name:'pan',label:'PAN'}};
const contactFields:Record<string,{name:string;label:string}>={email:{name:'email',label:'Email'},phone:{name:'phone',label:'Indian mobile number'},'gstInfo.gstNumber':{name:'gstNumber',label:'GST number'},'gstInfo.registeredName':{name:'gstName',label:'Registered business name'},'gstInfo.address':{name:'gstAddress',label:'Billing address'},'gstInfo.email':{name:'email',label:'Email'},'gstInfo.mobile':{name:'phone',label:'Indian mobile number'},'contactInfo.ecn':{name:'emergencyName',label:'Emergency contact name'},'contactInfo.emails.0':{name:'emergencyEmail',label:'Emergency contact email'},'contactInfo.contacts.0':{name:'emergencyPhone',label:'Emergency contact phone'}};
export function guestIssueField(path:string) {
  const normalized=path.replace(/^guests\./,'');
  const match=/^travellers\.(\d+)\.(\w+)$/.exec(normalized);
  if(match&&travellerFields[match[2]])return {...travellerFields[match[2]],name:`${travellerFields[match[2]].name}-${match[1]}`,index:Number(match[1])};
  return {...(contactFields[normalized]??{name:'',label:'Booking details'}),index:undefined};
}
export function parseGuestIssues(value:unknown):GuestIssue[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(item=>item&&typeof item==='object'&&typeof item.path==='string'&&typeof item.message==='string'?[{path:item.path.replace(/^guests\./,''),message:item.message}]:[]);
}
/** One payload builder for review and payment; no values are persisted. */
export function guestsFromForm(values:FormData,party:string[],roomIndexes?:number[]) {
  const get=(name:string)=>String(values.get(name)??'');
  const travellers=party.map((pt,index)=>({ti:get(`title-${index}`),pt,...(roomIndexes?{roomIndex:roomIndexes[index]}:{}),fN:get(`first-${index}`),lN:get(`last-${index}`),...(get(`dob-${index}`)?{dob:get(`dob-${index}`)}:{}),...(get(`passport-${index}`)?{pNum:get(`passport-${index}`)}:{}),...(get(`expiry-${index}`)?{eD:get(`expiry-${index}`)}:{}),...(get(`pan-${index}`)?{pan:get(`pan-${index}`).toUpperCase()}:{}),...(get(`nationality-${index}`)?{pNat:get(`nationality-${index}`).toUpperCase()}:{})}));
  return {travellers,email:get('email'),phone:get('phone'),...(get('gstNumber')?{gstInfo:{gstNumber:get('gstNumber').toUpperCase(),registeredName:get('gstName'),email:get('email'),mobile:get('phone'),address:get('gstAddress')}}:{}),...(get('emergencyName')?{contactInfo:{ecn:get('emergencyName'),emails:[get('emergencyEmail')],contacts:[get('emergencyPhone')]}}:{})};
}

/** Preserve the form's pre-existing native constraints while showing all errors.
 * This is a browser presentation guard; it does not replace server validation. */
export type GuestNativeValidity = Partial<Pick<ValidityState,'badInput'|'customError'|'patternMismatch'|'rangeOverflow'|'rangeUnderflow'|'stepMismatch'|'tooLong'|'tooShort'|'typeMismatch'|'valueMissing'|'valid'>>;
export type GuestNativeField = {name:string;value:string;validity:GuestNativeValidity;validationMessage?:string};
function guestFieldPath(name:string):string {
  const match=/^([a-z]+)-(\d+)$/.exec(name);
  const traveller=match&&Object.entries(travellerFields).find(([,field])=>field.name===match[1]);
  if(traveller&&match)return `travellers.${match[2]}.${traveller[0]}`;
  return Object.entries(contactFields).find(([,field])=>field.name===name)?.[0]??'travellers';
}
export function guestNativeIssues(fields:GuestNativeField[],today:string):GuestIssue[] {
  return fields.flatMap(field=>{
    const path=guestFieldPath(field.name),v=field.validity;
    // The date input already has this max. Compare explicitly too, so autofill
    // and the final payment recheck use today's India date, not a stale render.
    if(/^dob-\d+$/.test(field.name)&&/^\d{4}-\d{2}-\d{2}$/.test(field.value)&&field.value>today)return [{path,message:`Date of birth cannot be after today (${today}).`}];
    const message=v.badInput?'Enter a valid value.':v.valueMissing?'Complete this required field.':v.typeMismatch?'Enter a valid value for this field.':v.patternMismatch?'Use the requested format.':v.rangeOverflow?'Use a value at or below the displayed maximum.':v.rangeUnderflow?'Use a value at or above the displayed minimum.':v.tooLong?'Use a shorter value.':v.tooShort?'Complete the minimum required length.':v.stepMismatch?'Use an allowed value for this field.':v.customError||v.valid===false?field.validationMessage||'Check this field.':null;
    return message?[{path,message}]:[];
  });
}

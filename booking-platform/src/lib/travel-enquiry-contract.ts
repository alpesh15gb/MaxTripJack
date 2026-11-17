import {z} from 'zod';
import {normalizeWhatsAppPhone} from './customer-identity';
import {maxAiSensitiveMessage} from './max-ai-sensitive';

/** Shared public enquiry shape. Contact details are collected outside model chat. */
export const enquiryServices=['VISA','INSURANCE','HOLIDAY','CRUISE'] as const;
export type EnquiryService=typeof enquiryServices[number];
export const enquiryServiceLabels:Record<EnquiryService,string>={VISA:'Visa assistance',INSURANCE:'Travel insurance',HOLIDAY:'Holiday package',CRUISE:'Cruise holiday'};
const text=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value),'Use plain text without control characters.');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'Enter a valid calendar date.');
export const enquiryDraftSchema=z.object({
  service:z.enum(enquiryServices),
  destination:text(2,150),
  travelWindow:text(2,120),
  adults:z.number().int().min(0).max(50),
  childAges:z.array(z.number().int().min(0).max(17)).max(20),
  departureCity:text(2,120).optional(),
  travelStart:date.optional(),
  travelEnd:date.optional(),
  durationNights:z.number().int().min(1).max(365).optional(),
  nationality:text(2,80).optional(),
  countryOfResidence:text(2,80).optional(),
  purpose:text(2,120).optional(),
  travellerAges:z.array(z.number().int().min(0).max(100)).max(70).optional(),
  budgetRupees:z.number().positive().max(100_000_000).optional(),
  budgetBasis:z.enum(['TOTAL','PER_PERSON']).optional(),
  cabinPreference:text(2,120).optional(),
  notes:text(2,800).optional(),
}).strict().superRefine((value,context)=>{
  const issue=(path:string,message:string)=>context.addIssue({code:'custom',path:[path],message});
  if(value.adults+value.childAges.length<1)issue('adults','Add at least one traveller.');
  if(value.travelEnd&&!value.travelStart)issue('travelStart','Add the start date when specifying an end date.');
  if(value.travelStart&&value.travelEnd&&value.travelEnd<value.travelStart)issue('travelEnd','The end date must be on or after the start date.');
  if(value.service==='VISA'){
    if(!value.nationality)issue('nationality','Add the passport nationality.');
    if(!value.purpose)issue('purpose','Add the purpose of travel.');
  }
  if(value.service==='HOLIDAY'&&!value.departureCity)issue('departureCity','Add the departure city.');
  if(value.service==='INSURANCE'){
    const ages=value.travellerAges;
    if(!ages||ages.length!==value.adults+value.childAges.length)issue('travellerAges','Add an age for every traveller.');
    else if(ages.filter(age=>age>=18).length!==value.adults||JSON.stringify(ages.filter(age=>age<18).sort((a,b)=>a-b))!==JSON.stringify([...value.childAges].sort((a,b)=>a-b)))issue('travellerAges','Traveller ages must match the adults and children.');
  }
  if((value.budgetRupees!==undefined)!==(value.budgetBasis!==undefined))issue('budgetBasis','Choose whether the budget is total or per person.');
  if(maxAiSensitiveMessage(Object.values(value).filter(item=>typeof item==='string').join('\n')))issue('notes','Remove passwords, verification codes and payment credentials.');
  // Obvious contact/document values belong in the separate contact form or a
  // team-approved document channel. This is deliberately not a claim to detect all PII.
  for(const [field,item] of Object.entries(value))if(typeof item==='string'){
    if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item)||/\+[1-9][\d ()-]{7,}\d/.test(item)||/\b(?:phone|mobile|whatsapp|contact number)\s*(?:(?:number|no\.?|is)\s*)?[:=]?\s*\d[\d ()-]{7,}\d/i.test(item))issue(field,'Keep contact details in the contact form, outside the travel summary.');
    if(/\b(?:passport|pan|aadhaar)\s*(?:(?:number|no\.?|#)\s*)?(?:is\s+|[:=]\s*)(?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+/i.test(item))issue(field,'Keep identity document numbers out of the travel summary.');
  }
});
export type EnquiryDraft=z.infer<typeof enquiryDraftSchema>;

export function enquiryDateError(draft:EnquiryDraft,today:string):string|null{
  return draft.travelStart&&draft.travelStart<today?'Your travel start date has passed. Update it or give a flexible travel window.':null;
}

export const enquiryContactSchema=z.object({
  name:text(2,120),
  email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()).optional(),
  phone:z.string().trim().max(40).transform(value=>normalizeWhatsAppPhone(value)).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Include a valid country code and phone number.')).optional(),
  preferredChannel:z.enum(['EMAIL','PHONE','WHATSAPP']),
}).strict().superRefine((value,context)=>{
  if(value.preferredChannel==='EMAIL'&&!value.email)context.addIssue({code:'custom',path:['email'],message:'Enter an email for your reply.'});
  if(value.preferredChannel!=='EMAIL'&&!value.phone)context.addIssue({code:'custom',path:['phone'],message:'Enter a phone number for your reply.'});
});
export type EnquiryContact=z.infer<typeof enquiryContactSchema>;
export const enquirySubmitSchema=z.object({requestId:z.string().uuid(),draft:enquiryDraftSchema,contact:enquiryContactSchema,consent:z.literal(true)}).strict();
export type EnquirySubmission=z.infer<typeof enquirySubmitSchema>;
export type EnquiryStatus='NEW'|'CONTACTED'|'QUOTED'|'CLOSED';
export type EnquiryCrmStatus='PENDING'|'DELIVERED'|'ACTION_REQUIRED'|'NOT_CONFIGURED'|'LEGACY_DELIVERY'|'DESTINATION_REVIEW';
export type EnquiryReceipt={id:string;reference:string;service:EnquiryService;status:EnquiryStatus;createdAt:string;crmStatus:EnquiryCrmStatus;crmReference?:string;crmEnvironment?:'test'|'live'};

export function enquirySummary(draft:EnquiryDraft):string[]{
  return [draft.destination,draft.travelWindow,
    `${draft.adults} adult${draft.adults===1?'':'s'}${draft.childAges.length?` · ${draft.childAges.length} child${draft.childAges.length===1?'':'ren'} (ages ${draft.childAges.join(', ')})`:''}`,
    ...(draft.departureCity?[`From ${draft.departureCity}`]:[]),
    ...(draft.nationality?[`Passport nationality: ${draft.nationality}`]:[]),
    ...(draft.purpose?[`Purpose: ${draft.purpose}`]:[]),
    ...(draft.durationNights?[`${draft.durationNights} nights`]:[]),
  ];
}

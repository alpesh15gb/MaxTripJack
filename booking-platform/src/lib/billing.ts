import {z} from 'zod';
import {billingCountries} from './billing-countries';
const text=z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/);
const optional=(field:z.ZodType<string>)=>z.preprocess(value=>typeof value==='string'&&!value.trim()?undefined:value,field.optional());
export const billingSchema=z.object({firstName:text,lastName:text,emailId:z.string().trim().email().max(254),addressCountry:z.string().refine(code=>billingCountries.some(country=>country.code===code),'Select a country.'),addressStreet1:optional(text.max(200)),addressCity:optional(text),addressState:optional(text)}).strict().transform(({addressStreet1,addressCity,addressState,...identity})=>({...identity,...(addressStreet1?{addressStreet1}:{}),...(addressCity?{addressCity}:{}),...(addressState?{addressState}:{})}));
export const billingForProduct=(product:'FLIGHT'|'HOTEL')=>billingSchema.superRefine((data,ctx)=>{if(product==='FLIGHT')for(const key of ['addressStreet1','addressCity','addressState'] as const)if(!data[key])ctx.addIssue({code:'custom',path:[key],message:'Complete the payer billing address for this flight.'});});
export type BillingData=z.infer<typeof billingSchema>;
export function billingFromForm(data:FormData):BillingData{return Object.fromEntries(['firstName','lastName','emailId','addressCountry','addressStreet1','addressCity','addressState'].map(key=>[key,String(data.get('billing-'+key)??'').trim()])) as BillingData;}

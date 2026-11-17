import {z} from 'zod';
import type {EnquiryCrmStatus} from './travel-enquiry-contract';

/** Enquiries have their own Safar destination; legacy CRM settings never enable it. */
export function enquiryCrmConfigured(env:Readonly<Record<string,string|undefined>>=process.env):boolean{
  if(!['test','live'].includes(env.SAFAR_ENQUIRY_MODE||'test'))return false;
  if(!env.SAFAR_ENQUIRY_URL||!env.SAFAR_ENQUIRY_SIGNING_KEY||env.SAFAR_ENQUIRY_SIGNING_KEY.length<32||!env.SAFAR_ENQUIRY_KEY_ID||!/^[A-Za-z0-9_-]{1,64}$/.test(env.SAFAR_ENQUIRY_KEY_ID))return false;
  try{const url=new URL(env.SAFAR_ENQUIRY_URL);return !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/api/integrations/max-ai/enquiries'&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname));}catch{return false;}
}
export function enquiryCrmStatus(row:{delivered_at:unknown;attempts:number;crm_receiver?:string|null},configured=enquiryCrmConfigured()):EnquiryCrmStatus{
  if(row.crm_receiver!=='safar')return row.delivered_at?'LEGACY_DELIVERY':'DESTINATION_REVIEW';
  if(row.delivered_at)return 'DELIVERED';
  if(!configured)return 'NOT_CONFIGURED';
  return row.attempts>=12?'ACTION_REQUIRED':'PENDING';
}
const receiptSchema=z.object({enquiryId:z.string().uuid(),accepted:z.literal(true),receiver:z.literal('safar'),environment:z.enum(['test','live']),reference:z.string().regex(/^ME-[A-F0-9]{12}$/),recordId:z.string().uuid()}).strict();
/** A generic 200 or an old CRM receipt is not evidence of a Safar inbox record. */
export type ExpectedSafarReceipt={enquiryId:string;reference:string;environment:'test'|'live'};
export function readEnquiryCrmReceipt(value:unknown,expected:ExpectedSafarReceipt){
  const receipt=receiptSchema.parse(value);
  if(receipt.enquiryId!==expected.enquiryId||receipt.reference!==expected.reference||receipt.environment!==expected.environment)throw new Error('CRM enquiry acknowledgement does not match.');
  return receipt;
}
export async function readEnquiryCrmResponse(response:Response,expected:ExpectedSafarReceipt){
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing CRM acknowledgement.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new Error('CRM acknowledgement too large.');}chunks.push(value);}
  return readEnquiryCrmReceipt(JSON.parse(Buffer.concat(chunks).toString('utf8')),expected);
}

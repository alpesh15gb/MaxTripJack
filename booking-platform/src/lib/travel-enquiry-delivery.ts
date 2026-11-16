import {z} from 'zod';
import type {EnquiryCrmStatus} from './travel-enquiry-contract';

/** The same signed transport as bookings; never substitute an arbitrary endpoint. */
export function enquiryCrmConfigured(env:Readonly<Record<string,string|undefined>>=process.env):boolean{
  if(!env.CRM_EVENTS_URL||!env.CRM_SIGNING_KEY||env.CRM_SIGNING_KEY.length<32||!env.CRM_KEY_ID)return false;
  try{const url=new URL(env.CRM_EVENTS_URL);return !url.username&&!url.password&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname));}catch{return false;}
}
export function enquiryCrmStatus(row:{delivered_at:unknown;attempts:number},configured=enquiryCrmConfigured()):EnquiryCrmStatus{
  if(row.delivered_at)return 'DELIVERED';
  if(!configured)return 'NOT_CONFIGURED';
  return row.attempts>=12?'ACTION_REQUIRED':'PENDING';
}
const receiptSchema=z.object({enquiryId:z.string().uuid(),accepted:z.literal(true),crmReference:z.string().min(1).max(100),leadId:z.string().min(1).max(120)}).strict();
/** A generic 200 from an old receiver is not evidence that a CRM lead exists. */
export function readEnquiryCrmReceipt(value:unknown,enquiryId:string){
  const receipt=receiptSchema.parse(value);
  if(receipt.enquiryId!==enquiryId)throw new Error('CRM enquiry acknowledgement does not match.');
  return receipt;
}
export async function readEnquiryCrmResponse(response:Response,enquiryId:string){
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing CRM acknowledgement.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new Error('CRM acknowledgement too large.');}chunks.push(value);}
  return readEnquiryCrmReceipt(JSON.parse(Buffer.concat(chunks).toString('utf8')),enquiryId);
}

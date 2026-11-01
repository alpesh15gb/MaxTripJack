import {json,boundedText,failure} from '@/lib/http';
import {transaction} from '@/lib/db';
import {enqueuePayGlocalWebhook,payGlocalWebhookHint} from '@/lib/payglocal-webhook';

export async function POST(request?:Request){
 try{
  if(request?.body){
   let value:unknown;
   try{value=JSON.parse(await boundedText(request,65536));}
   catch(error){if(error instanceof SyntaxError)return json({received:true});throw error;}
   const hint=payGlocalWebhookHint(value);
   // Persist before acknowledgement. No provider call or financial transition
   // occurs here. Storage failure must be retryable by the sender.
   if(hint)await transaction(tx=>enqueuePayGlocalWebhook(tx,hint));
  }
  return json({received:true});
 }catch(error){return failure(error);}
}

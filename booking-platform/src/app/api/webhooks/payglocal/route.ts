import {json,boundedText,failure} from '@/lib/http';
// Callback signatures are not documented. The durable worker independently
// polls our stored references. Never write financial state from webhook input.
export async function POST(request?:Request){try{if(request?.body)await boundedText(request,65536);return json({received:true});}catch(error){return failure(error);}}

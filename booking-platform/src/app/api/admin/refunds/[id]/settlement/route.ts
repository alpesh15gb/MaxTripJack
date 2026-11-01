import {z} from 'zod';
import {administrator} from '@/lib/access';
import {body,sameOrigin,json,failure} from '@/lib/http';
import {transaction} from '@/lib/db';
import {recordPayGlocalSettlement,settlementSchema} from '@/lib/payglocal-settlement';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{sameOrigin(request);const actor=await administrator(request,'refunds:execute'),id=z.string().uuid().parse((await context.params).id),input=await body(request,settlementSchema);const result=await transaction(tx=>recordPayGlocalSettlement(tx,id,input,actor.userId));return json({...result,message:'Settlement recorded from your verified evidence. No new gateway refund request was sent.'});}catch(error){return failure(error);}}

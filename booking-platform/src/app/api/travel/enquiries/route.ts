import {z} from 'zod';
import {body,failure,json,sameOrigin} from '@/lib/http';
import {shoppingAccess,shoppingResponse,type ShoppingAccess} from '@/lib/guest-shopping';
import {shoppingPeer} from '@/lib/guest-shopping-policy';
import {requestLimit} from '@/lib/request-limit';
import {enquirySubmitSchema} from '@/lib/travel-enquiry-contract';
import {findEnquiryRequest,saveEnquiry} from '@/lib/travel-enquiries';

export const runtime='nodejs';
export async function POST(request:Request){
  let access:ShoppingAccess|undefined;
  try{
    sameOrigin(request);
    const input=await body(request,enquirySubmitSchema);
    access=await shoppingAccess(request,'search');
    await requestLimit(`enquiry:peer:${shoppingPeer(request,process.env.PUBLIC_SHOPPING_TRUST_PROXY==='true')}`,'submit',8);
    await requestLimit(access.actor.userId,'enquiry:submit',4);
    await requestLimit('enquiry:global','submit',40);
    return shoppingResponse(json({enquiry:await saveEnquiry(access.actor,input)},201),access);
  }catch(error){const response=failure(error);return access?shoppingResponse(response,access):response;}
}
/** Recovery checks are scoped to this authenticated user or HTTP-only guest cookie. */
export async function GET(request:Request){
  let access:ShoppingAccess|undefined;
  try{
    const requestId=z.string().uuid().parse(new URL(request.url).searchParams.get('requestId'));
    access=await shoppingAccess(request,'search');
    await requestLimit(access.actor.userId,'enquiry:status',30);
    return shoppingResponse(json({enquiry:await findEnquiryRequest(access.actor,requestId)}),access);
  }catch(error){const response=failure(error);return access?shoppingResponse(response,access):response;}
}

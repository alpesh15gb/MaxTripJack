import {z} from 'zod';
import {shoppingAccess} from '@/lib/guest-shopping';
import {body,sameOrigin,json,failure,HttpError} from '@/lib/http';
import {customerFlightSearchSnapshot} from '@/lib/flight-search-snapshot';

export async function POST(request:Request){
  try{
    sameOrigin(request);
    const {searchId}=await body(request,z.object({searchId:z.string().uuid()}).strict());
    const {actor}=await shoppingAccess(request,'detail');
    return json(await customerFlightSearchSnapshot(searchId,actor));
  }catch(error){
    return failure(error instanceof HttpError&&error.status===404
      ?new HttpError(409,'This flight search is no longer available in this browser. Search again to continue.'):error);
  }
}

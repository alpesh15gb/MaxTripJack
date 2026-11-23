import "server-only";
import { HttpError } from "../http";
import { tripjackApiKey } from "./tripjack-key";
import { tripjackFailureMetadata } from "./tripjack-diagnostics";
export type Product="FLIGHT"|"HOTEL";
export class TripjackRequestError extends HttpError {
 constructor(public readonly upstream:ReturnType<typeof tripjackFailureMetadata>,message:string){super(502,message);}
}

export async function tripjack(product:Product,path:string,payload?:unknown,booker=false,method:"GET"|"POST"="POST",signal?:AbortSignal){
 const key=tripjackApiKey(product);
 if(!key)throw new HttpError(503,`The ${product.toLowerCase()} service is temporarily unavailable. Please try again later or contact MaxTravel.`);
 // UAT-only until supplier certification. No arbitrary client-supplied hosts or paths.
 const host=product==="FLIGHT"||path.startsWith("/ums/")||path==="/hms/v3/nationality-info"?"https://apitest.tripjack.com":booker?"https://apitest-hotel-booker.tripjack.com":"https://apitest-hms.tripjack.com";
 let response:Response;
 const timeout=AbortSignal.timeout(45000);
 try{response=await fetch(host+path,{method,headers:{apikey:key,"Content-Type":"application/json",Accept:"application/json"},body:payload===undefined?undefined:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:"error",cache:"no-store"});}
 catch{signal?.throwIfAborted();console.warn("[tripjack:request-failed]",tripjackFailureMetadata(product,null,null));throw new HttpError(502,"We could not confirm the booking response. Check My trips or contact MaxTravel before trying again.");}
 const data=await response.json().catch(()=>null);
 signal?.throwIfAborted();
 if(!response.ok||!data||data.status?.success!==true){
  const upstream=tripjackFailureMetadata(product,response.status,data);
  console.warn("[tripjack:request-failed]",upstream);
  throw new TripjackRequestError(upstream,product==="HOTEL"&&path==="/hms/v3/hotel/review"?"The supplier could not validate this room rate. Refresh room options or choose another stay. No booking or payment was made by this review.":"We could not complete your request. Refresh availability or contact MaxTravel.");
 }
 return data;
}
export const paths={FLIGHT:{search:"/fms/v1/air-search-all",review:"/fms/v1/review",book:"/oms/v1/air/book",details:"/oms/v1/booking-details",validate:"/oms/v1/air/book/fare-validate"},HOTEL:{search:"/hms/v3/hotel/listing",detail:"/hms/v3/hotel/pricing",review:"/hms/v3/hotel/review",book:"/oms/v3/hotel/book",details:"/oms/v3/hotel/booking-details"}};

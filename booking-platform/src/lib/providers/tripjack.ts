import "server-only";
import { HttpError } from "../http";
export type Product="FLIGHT"|"HOTEL";
export async function tripjack(product:Product,path:string,payload?:unknown,booker=false,method:"GET"|"POST"="POST"){
 const key=process.env[product==="FLIGHT"?"TRIPJACK_FLIGHT_API_KEY":"TRIPJACK_HOTEL_API_KEY"];
 if(!key)throw new HttpError(503,`The ${product.toLowerCase()} service is temporarily unavailable. Please try again later or contact MaxTravel.`);
 // UAT-only until supplier certification. No arbitrary client-supplied hosts or paths.
 const host=product==="FLIGHT"||path.startsWith("/ums/")||path==="/hms/v3/nationality-info"?"https://apitest.tripjack.com":booker?"https://apitest-hotel-booker.tripjack.com":"https://apitest-hms.tripjack.com";
 let response:Response;
 try{response=await fetch(host+path,{method,headers:{apikey:key,"Content-Type":"application/json",Accept:"application/json"},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(45000),redirect:"error",cache:"no-store"});}
 catch{throw new HttpError(502,"We could not confirm the booking response. Check My trips or contact MaxTravel before trying again.");}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||data.status?.success!==true)throw new HttpError(502,"We could not complete your request. Refresh availability or contact MaxTravel.");
 return data;
}
export const paths={FLIGHT:{search:"/fms/v1/air-search-all",review:"/fms/v1/review",book:"/oms/v1/air/book",details:"/oms/v1/booking-details",validate:"/oms/v1/air/book/fare-validate"},HOTEL:{search:"/hms/v3/hotel/listing",detail:"/hms/v3/hotel/pricing",review:"/hms/v3/hotel/review",book:"/oms/v3/hotel/book",details:"/oms/v3/hotel/booking-details"}};

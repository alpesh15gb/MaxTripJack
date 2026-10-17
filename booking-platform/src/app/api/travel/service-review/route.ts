import { principal } from "@/lib/access";
import { body,sameOrigin,json,failure } from "@/lib/http";
import { reviewFlightService,serviceReviewSchema } from "@/lib/flight-services";
export async function POST(request:Request){try{sameOrigin(request);return json(await reviewFlightService(await body(request,serviceReviewSchema),await principal(request)));}catch(e){return failure(e);}}

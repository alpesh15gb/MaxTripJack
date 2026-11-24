import { z } from "zod";
import { checkoutAccess, claimGuestSearch, shoppingResponse, type ShoppingAccess } from "@/lib/guest-shopping";
import { isGuestActor } from "@/lib/guest-checkout";
import { body,sameOrigin,json,failure,HttpError } from "@/lib/http";
import { FlightExtrasRefreshError, reviewSupplier } from "@/lib/supplier-flow";

const reviewInput = z.object({
  searchId:z.string().uuid(),
  priceIds:z.array(z.string().min(1).max(200)).min(1).max(6).optional(),
  hid:z.string().regex(/^\d+$/).optional(),
  optionId:z.string().min(1).max(200).optional(),
  previousQuoteId:z.string().uuid().optional(),
  removeFlightExtras:z.literal(true).optional(),
}).strict();

export async function POST(request: Request) {
  const deadline = AbortSignal.timeout(18_000);
  let access: ShoppingAccess | undefined;
  try {
    sameOrigin(request);
    access = await checkoutAccess(request);
    const {actor} = access;
    const data = await body(request, reviewInput);
    if (!isGuestActor(actor)) await claimGuestSearch(request, data.searchId, actor);
    const quote = await reviewSupplier(data.searchId, data, actor, AbortSignal.any([deadline, request.signal]));
    return shoppingResponse(json(quote), access);
  } catch (error) {
    if (deadline.aborted) {
      const response = json({error:"Checking the current price took too long. Try again or choose another option."}, 504);
      return access ? shoppingResponse(response, access) : response;
    }
    if (error instanceof FlightExtrasRefreshError) {
      const response=json({error:error.message,code:"FLIGHT_EXTRAS_REFRESH"},409);
      return access?shoppingResponse(response,access):response;
    }
    return failure(error instanceof HttpError && error.status === 404
      ? new HttpError(409, "This search is no longer available in this browser. Search again to continue.")
      : error);
  }
}

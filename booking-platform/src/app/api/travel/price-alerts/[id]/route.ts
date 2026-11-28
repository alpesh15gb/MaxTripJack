import {principal} from '@/lib/access';
import {flightPriceAlertId,removeFlightPriceAlert} from '@/lib/flight-price-alerts';
import {failure,json,sameOrigin} from '@/lib/http';

export async function DELETE(request:Request,{params}: {params:Promise<{id:string}>}) {
  try {
    sameOrigin(request);
    const actor = await principal(request);
    const id = flightPriceAlertId.parse((await params).id);
    await removeFlightPriceAlert(actor.userId,id);
    return json({deleted:true});
  } catch (error) {
    return failure(error);
  }
}

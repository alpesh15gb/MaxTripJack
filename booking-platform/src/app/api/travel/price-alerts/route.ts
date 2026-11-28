import {principal} from '@/lib/access';
import {configuredAuthBaseURL} from '@/lib/auth-origin';
import {customerEmail} from '@/lib/customer-identity';
import {flightPriceAlertSubscriptionsReady,flightPriceAlertSchema,listFlightPriceAlerts,subscribeFlightPriceAlert} from '@/lib/flight-price-alerts';
import {body,failure,HttpError,json,sameOrigin} from '@/lib/http';
import {requestLimit} from '@/lib/request-limit';

export async function GET(request:Request) {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL || !configuredAuthBaseURL())
    return json({available:false,alerts:[]});
  try {
    const available = await flightPriceAlertSubscriptionsReady();
    const actor = await principal(request).catch(error=>{
      if (error instanceof HttpError && error.status===401) return null;
      throw error;
    });
    if (!actor) return json({available,alerts:[]});
    if (actor.companyId || !actor.session.user.emailVerified || !customerEmail(actor.session.user))
      return json({available:false,alerts:[]});
    return json({available,alerts:await listFlightPriceAlerts(actor.userId)});
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request:Request) {
  try {
    sameOrigin(request);
    const actor = await principal(request);
    if (actor.companyId || !actor.session.user.emailVerified || !customerEmail(actor.session.user))
      throw new HttpError(403,'Flight price alerts require a verified personal email.');
    if (!await flightPriceAlertSubscriptionsReady()) throw new HttpError(503,'Flight price alerts are temporarily unavailable.');
    await requestLimit(actor.userId,'flight-price-alert-subscribe',5);
    return json({alert:await subscribeFlightPriceAlert(actor.userId,await body(request,flightPriceAlertSchema))});
  } catch (error) {
    return failure(error);
  }
}

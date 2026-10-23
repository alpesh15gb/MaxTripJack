import {z} from 'zod';
// Only supplier selection identifiers and public itinerary data survive login.
// Never persist quotes, guest/contact fields, documents or payment information.
const segment=z.object({dt:z.string(),at:z.string(),duration:z.number().optional(),isRs:z.boolean().optional(),fD:z.object({aI:z.object({name:z.string(),code:z.string().optional()}),fN:z.string()}),da:z.object({code:z.string(),city:z.string().optional()}),aa:z.object({code:z.string(),city:z.string().optional()})});
const fare=z.object({id:z.string(),fareIdentifier:z.string(),customerEstimateMinor:z.number().nullable().optional(),fD:z.record(z.string(),z.object({cc:z.string().optional(),rT:z.number().optional(),bI:z.object({iB:z.string().optional(),cB:z.string().optional()}).optional()}))});
const schema=z.object({version:z.literal(1),savedAt:z.number(),product:z.enum(['FLIGHT','HOTEL']),searchId:z.string().uuid(),selection:z.object({priceIds:z.array(z.string()).max(12).optional(),hid:z.string().optional(),optionId:z.string().optional()}),flights:z.array(z.object({sI:z.array(segment).max(24),totalPriceList:z.array(fare).max(12)})).max(12)});
export type BookingHandoff=z.infer<typeof schema>;
export const BOOKING_HANDOFF_KEY='maxtravel:selection:v1';
export type BookingHandoffState={state:'ready';handoff:BookingHandoff}|{state:'expired'|'unavailable'};
/** Expiry is known only after the full stored selection validates. Missing, corrupt,
 * inaccessible or future-dated tab data must not be described as an expired fare. */
export function inspectBookingHandoff(value:unknown,now=Date.now()):BookingHandoffState{
 const parsed=schema.safeParse(value);if(!parsed.success||!Number.isFinite(now))return {state:'unavailable'};
 const age=now-parsed.data.savedAt;
 if(age<0)return {state:'unavailable'};
 return age<14*60*1000?{state:'ready',handoff:parsed.data}:{state:'expired'};
}
export function parseBookingHandoff(value:unknown,now=Date.now()):BookingHandoff|null{
 const result=inspectBookingHandoff(value,now);
 return result.state==='ready'?result.handoff:null;
}

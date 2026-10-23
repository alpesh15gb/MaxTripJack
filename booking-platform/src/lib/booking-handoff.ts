import {z} from 'zod';
// Only bounded supplier identifiers and public itinerary labels survive login.
// Never persist quotes, guest/contact fields, documents or payment information.
const text=z.string().max(500),id=z.string().min(1).max(2048);
const segment=z.object({dt:z.string().max(50),at:z.string().max(50),duration:z.number().nonnegative().optional(),isRs:z.boolean().optional(),fD:z.object({aI:z.object({name:text,code:z.string().max(12).optional()}),fN:z.string().max(20)}),da:z.object({code:z.string().max(12),city:text.optional()}),aa:z.object({code:z.string().max(12),city:text.optional()})});
const fare=z.object({id,fareIdentifier:text,customerEstimateMinor:z.number().nonnegative().nullable().optional(),fD:z.record(z.string().max(32),z.object({cc:text.optional(),rT:z.number().optional(),bI:z.object({iB:text.optional(),cB:text.optional()}).optional()})).refine(value=>Object.keys(value).length<=12)});
const schema=z.object({version:z.literal(1),savedAt:z.number(),key:z.string().uuid().optional(),ownerId:z.string().min(1).max(200).optional(),product:z.enum(['FLIGHT','HOTEL']),searchId:z.string().uuid(),selection:z.object({priceIds:z.array(id).max(12).optional(),hid:id.optional(),optionId:id.optional()}),flights:z.array(z.object({sI:z.array(segment).max(24),totalPriceList:z.array(fare).max(12)})).max(12),hotel:z.object({name:text,roomLabel:text,mealBasis:text.optional()}).optional()}).refine(value=>value.product==='FLIGHT'?Boolean(value.selection.priceIds?.length)&&!value.selection.hid&&!value.selection.optionId:Boolean(value.selection.hid&&value.selection.optionId)&&!value.selection.priceIds?.length);
export type BookingHandoff=z.infer<typeof schema>;
export const BOOKING_HANDOFF_KEY='maxtravel:selection:v1';
export const BOOKING_HANDOFF_TTL=14*60*1000;
export type BookingHandoffState={state:'ready';handoff:BookingHandoff}|{state:'expired'|'unavailable'};
type HandoffContext={userId:string|null;key?:string};
/** A history entry can recover only its own selection. Account-bound selections
 * cannot be adopted after sign-out/account switching; guest choices may sign in.
 * Server ownership and fresh supplier review remain authoritative. */
export function inspectBookingHandoff(value:unknown,now=Date.now(),context?:HandoffContext):BookingHandoffState{
 const parsed=schema.safeParse(value);if(!parsed.success||!Number.isFinite(now))return {state:'unavailable'};
 if(context&&((parsed.data.ownerId&&parsed.data.ownerId!==context.userId)||((context.key??null)!==(parsed.data.key??null))))return {state:'unavailable'};
 const age=now-parsed.data.savedAt;
 if(age<0)return {state:'unavailable'};
 return age<BOOKING_HANDOFF_TTL?{state:'ready',handoff:parsed.data}:{state:'expired'};
}
export function parseBookingHandoff(value:unknown,now=Date.now()):BookingHandoff|null{
 const result=inspectBookingHandoff(value,now);
 return result.state==='ready'?result.handoff:null;
}

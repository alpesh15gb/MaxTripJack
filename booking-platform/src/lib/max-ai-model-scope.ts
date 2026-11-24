import type {MaxAiMessage} from './max-ai-conversation';
import type {MaxAiFunction} from './max-ai-provider';

/** Keep straightforward questions small, while preserving every tool for
 * mixed or ambiguous requests. Tool execution remains server allowlisted. */
export function maxAiModelScope(messages:readonly MaxAiMessage[],definitions:readonly MaxAiFunction[]){
  const recent=messages.filter(message=>message.role==='user').slice(-4).map(message=>message.content).join(' ').toLowerCase();
  const latest=messages.filter(message=>message.role==='user').at(-1)?.content.trim().toLowerCase()??'';
  const general=/^(?:what (?:is|are|does)|how (?:does|do)|explain|difference between)\b/.test(latest)
    &&!/\b(?:my|our|booking|reservation|payment|refund|cancel\w*|price|fare|rate|available|availability|current|today|latest|visas?|insurance|baggage|seats?|hotels?|flights?|packages?|cruises?|account|tickets?)\b/.test(latest);
  if(general&&messages.filter(message=>message.role==='user').length===1)return {definitions:[] as MaxAiFunction[],general:true};

  const names=new Set<string>(['travel_help','navigate_task','company_info']);
  let matched=false;
  const add=(pattern:RegExp,tools:string[])=>{if(pattern.test(recent)){matched=true;tools.forEach(tool=>names.add(tool));}};
  add(/\b(?:flights?|fly|airlines?|airports?|air tickets?|fares?|pnr|e-ticket|layover|codeshare|baggage|seats?|meals?)\b/,['lookup_airports','search_flights']);
  add(/\b(?:hotels?|stays?|rooms?|property|properties|check.in|check.out|accommodation)\b/,['lookup_destinations','lookup_nationalities','search_hotels']);
  add(/\b(?:visas?|passports?|insurance|holidays?|packages?|cruises?|enquir(?:y|ies)|quotes?)\b/,['prepare_enquiry','find_packages']);
  add(/\b(?:my|our)\s+(?:\w+\s+){0,3}(?:trips?|bookings?|tickets?|reservations?|payments?|refunds?)\b|\b(?:booking|ticket|reservation|payment|refund)\s+status\b/,['my_trips']);
  return {definitions:matched?definitions.filter(tool=>names.has(tool.function.name)):[...definitions],general:false};
}

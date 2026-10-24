import type { Guests, Search } from './providers/contracts';
import { HttpError } from './http';
import { partyIssues, reviewGuestIssues, type GuestReview } from './guest-validation-rules';

/** Authoritative server guard: always use the saved search, never client counts. */
export function validateParty(search:Search,guests:Guests) {
  const fields=partyIssues(search,guests);
  if(fields.length)throw new HttpError(400,fields[0].message,fields.map(field=>({...field,path:`guests.${field.path}`})));
}
export function validateGuestReview(guests:Guests,review:GuestReview) {
  const fields=reviewGuestIssues(guests,review);
  if(fields.length)throw new HttpError(400,fields[0].message,fields.map(field=>({...field,path:`guests.${field.path}`})));
}

import { Guests, Search } from "./providers/contracts";
import { HttpError } from "./http";

/** Validate against the saved search, never a count supplied at checkout. */
export function validateParty(search: Search, guests: Guests) {
 const count=(type:string,room?:number)=>guests.travellers.filter(t=>t.pt===type&&(room===undefined||(t.roomIndex??0)===room)).length;
 if(search.product==="FLIGHT") {
  if(count("ADULT")!==search.adults||count("CHILD")!==(search.children??0)||count("INFANT")!==(search.infants??0)||guests.travellers.some(t=>t.roomIndex!==undefined))throw new HttpError(400,"Passenger types and counts must match your flight search.");
 } else {
  const rooms=search.rooms??[{adults:search.adults,children:search.childrenAges?.length??0,childAge:search.childrenAges??[]}];
  if(guests.travellers.some(t=>(t.roomIndex??0)>=rooms.length||t.pt==="INFANT"))throw new HttpError(400,"Guest room assignment is invalid.");
  rooms.forEach((room,i)=>{if(count("ADULT",i)!==room.adults||count("CHILD",i)!==room.children)throw new HttpError(400,"Guests must match the occupancy of each room.");});
 }
 const departure=search.product==="FLIGHT"?search.date:search.checkIn;
 for(const t of guests.travellers){
  if(t.pt!=="ADULT"&&!t.dob)throw new HttpError(400,"Children and infants require a date of birth.");
  if(t.dob){const birth=new Date(`${t.dob}T00:00:00Z`);if(!Number.isFinite(birth.getTime())||birth.toISOString().slice(0,10)!==t.dob||t.dob>=departure)throw new HttpError(400,"Date of birth must be valid and before travel.");
   if(search.product==="FLIGHT"){const travel=new Date(`${departure}T00:00:00Z`);let age=travel.getUTCFullYear()-birth.getUTCFullYear();if(travel.getUTCMonth()<birth.getUTCMonth()||(travel.getUTCMonth()===birth.getUTCMonth()&&travel.getUTCDate()<birth.getUTCDate()))age--;if((t.pt==="INFANT"&&age>=2)||(t.pt==="CHILD"&&(age<2||age>=12))||(t.pt==="ADULT"&&age<12))throw new HttpError(400,"Passenger age does not match the selected passenger type.");}
  }
  const lastTravel=search.product==="FLIGHT"?(search.legs?.at(-1)?.date??search.returnDate??search.date):search.checkOut;
  if(t.eD&&t.eD<=lastTravel)throw new HttpError(400,"Passport must be valid on the travel date.");
 }
 if(search.product==="HOTEL"){
  const rooms=search.rooms??[{adults:search.adults,children:search.childrenAges.length,childAge:search.childrenAges}];
  for(const [index,room] of rooms.entries()){
   const ages=guests.travellers.filter(t=>t.pt==="CHILD"&&(t.roomIndex??0)===index).map(t=>{const birth=new Date(`${t.dob}T00:00:00Z`),travel=new Date(`${search.checkIn}T00:00:00Z`);let age=travel.getUTCFullYear()-birth.getUTCFullYear();if(travel.getUTCMonth()<birth.getUTCMonth()||(travel.getUTCMonth()===birth.getUTCMonth()&&travel.getUTCDate()<birth.getUTCDate()))age--;return age;}).sort((a,b)=>a-b);
   if(ages.some((age,i)=>age!==[...room.childAge].sort((a,b)=>a-b)[i]))throw new HttpError(400,`Child dates of birth must match the searched ages for room ${index+1}.`);
  }
 }

}

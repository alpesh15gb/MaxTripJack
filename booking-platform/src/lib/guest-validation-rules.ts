import { guestSchema, type Guests, type Search } from './providers/contracts';

/** Browser-safe checks. The server must always rerun them against its saved search. */
export type GuestIssue = { path: string; message: string };
export type PartySearch =
  | Pick<Extract<Search, {product:'FLIGHT'}>, 'product'|'date'|'returnDate'|'legs'|'adults'|'children'|'infants'>
  | Pick<Extract<Search, {product:'HOTEL'}>, 'product'|'checkIn'|'checkOut'|'adults'|'childrenAges'|'rooms'>;
export type GuestReview = {
  conditions?: {pcs?:{pm?:boolean;pped?:boolean};dob?:{adobr?:boolean;cdobr?:boolean;idobr?:boolean};gst?:{igm?:boolean};iecr?:boolean;ipa?:boolean};
  option?: {compliance?:{passportRequired?:boolean;panRequired?:boolean;gstType?:string}};
};
function ageAt(birthDate:string, travelDate:string) {
  const birth=new Date(`${birthDate}T00:00:00Z`),travel=new Date(`${travelDate}T00:00:00Z`);
  let age=travel.getUTCFullYear()-birth.getUTCFullYear();
  if(travel.getUTCMonth()<birth.getUTCMonth()||(travel.getUTCMonth()===birth.getUTCMonth()&&travel.getUTCDate()<birth.getUTCDate()))age--;
  return age;
}
export function partyIssues(search:PartySearch, guests:Guests):GuestIssue[] {
  const issues:GuestIssue[]=[];
  const add=(path:string,message:string)=>issues.push({path,message});
  const count=(type:string,room?:number)=>guests.travellers.filter(t=>t.pt===type&&(room===undefined||(t.roomIndex??0)===room)).length;
  if(search.product==='FLIGHT') {
    if(count('ADULT')!==search.adults||count('CHILD')!==(search.children??0)||count('INFANT')!==(search.infants??0)||guests.travellers.some(t=>t.roomIndex!==undefined))add('travellers','Passenger types and counts must match your flight search.');
  } else {
    const rooms=search.rooms??[{adults:search.adults,children:search.childrenAges?.length??0,childAge:search.childrenAges??[]}];
    guests.travellers.forEach((t,i)=>{if((t.roomIndex??0)>=rooms.length||t.pt==='INFANT')add(`travellers.${i}.roomIndex`,'Guest room assignment is invalid.');});
    rooms.forEach((room,i)=>{if(count('ADULT',i)!==room.adults||count('CHILD',i)!==room.children)add('travellers',`Guests must match the occupancy of room ${i+1}.`);});
  }
  const departure=search.product==='FLIGHT'?search.date:search.checkIn;
  const lastTravel=search.product==='FLIGHT'?(search.legs?.at(-1)?.date??search.returnDate??search.date):search.checkOut;
  guests.travellers.forEach((t,i)=>{
    if(t.pt!=='ADULT'&&!t.dob)add(`travellers.${i}.dob`,'Children and infants require a date of birth.');
    if(t.dob) {
      const birth=new Date(`${t.dob}T00:00:00Z`);
      if(!Number.isFinite(birth.getTime())||birth.toISOString().slice(0,10)!==t.dob||t.dob>=departure)add(`travellers.${i}.dob`,'Date of birth must be valid and before travel.');
      else if(search.product==='FLIGHT') {
        const age=ageAt(t.dob,departure);
        if((t.pt==='INFANT'&&age>=2)||(t.pt==='CHILD'&&(age<2||age>=12))||(t.pt==='ADULT'&&age<12))add(`travellers.${i}.dob`,`${t.pt==='INFANT'?'Infants must be under 2':t.pt==='CHILD'?'Children must be age 2–11':'Adults must be age 12 or over'} on departure (${departure}).`);
      }
    }
    if(t.eD&&t.eD<=lastTravel)add(`travellers.${i}.eD`,`Passport expiry must be after the final travel date (${lastTravel}).`);
  });
  if(search.product==='HOTEL') {
    const rooms=search.rooms??[{adults:search.adults,children:search.childrenAges.length,childAge:search.childrenAges}];
    rooms.forEach((room,index)=>{
      const children=guests.travellers.flatMap((t,i)=>t.pt==='CHILD'&&(t.roomIndex??0)===index?[{index:i,age:ageAt(t.dob??'',search.checkIn)}]:[]).sort((a,b)=>a.age-b.age);
      // Match the age multiset without assigning ages by traveller order. Only
      // unmatched children need correction; valid siblings keep their details.
      const remaining=[...room.childAge];
      children.forEach(child=>{
        const match=remaining.indexOf(child.age);
        if(match>=0)remaining.splice(match,1);
        else add(`travellers.${child.index}.dob`,`Child dates of birth must match the searched ages for room ${index+1} (${room.childAge.join(', ')}) at check-in (${search.checkIn}).`);
      });
    });
  }
  return issues;
}

export function reviewGuestIssues(guests:Guests,review:GuestReview):GuestIssue[] {
  const issues:GuestIssue[]=[];
  const conditions=review.conditions??{},compliance=review.option?.compliance??{};
  guests.travellers.forEach((t,i)=>{
    const add=(field:string,message:string)=>issues.push({path:`travellers.${i}.${field}`,message});
    if(conditions.pcs?.pm||compliance.passportRequired) {
      if(!t.pNum)add('pNum','Passport number is required for this fare.');
      if(!t.pNat)add('pNat','Passport nationality is required for this fare.');
      if(!t.eD)add('eD','Passport expiry is required for this fare.');
    }else if(conditions.pcs?.pped&&!t.eD)add('eD','Passport expiry is required for this fare.');
    if((t.pt==='ADULT'?conditions.dob?.adobr:t.pt==='CHILD'?conditions.dob?.cdobr:conditions.dob?.idobr)&&!t.dob)add('dob','Date of birth is required for this fare.');
    if((conditions.ipa||compliance.panRequired)&&t.pt==='ADULT'&&!t.pan)add('pan','PAN is required for this fare.');
  });
  if((conditions.gst?.igm||['PASSTHROUGH','RESELLER'].includes(compliance.gstType??''))&&!guests.gstInfo)issues.push({path:'gstInfo.gstNumber',message:'GST information is required for this option.'},{path:'gstInfo.registeredName',message:'Registered business name is required for this option.'});
  if(conditions.iecr&&!guests.contactInfo)issues.push({path:'contactInfo.ecn',message:'Emergency contact is required for this fare.'},{path:'contactInfo.emails.0',message:'Emergency contact email is required for this fare.'},{path:'contactInfo.contacts.0',message:'Emergency contact phone is required for this fare.'});
  return issues;
}

function uniqueIssues(issues:GuestIssue[]){return issues.filter((issue,index,all)=>all.findIndex(other=>other.path===issue.path)===index);}
function schemaIssueMessage(path:string,fallback:string):string {
  const field=path.replace(/^travellers\.\d+\./,'');
  const messages:Record<string,string>={
    fN:'Enter a first name (up to 80 characters).',lN:'Enter a last name (up to 80 characters).',
    dob:'Enter a valid calendar date.',eD:'Enter a valid calendar date.',pid:'Enter a valid calendar date.',
    pNum:'Enter a passport number with 4–30 characters.',pNat:'Enter the 2-letter passport nationality code, such as IN.',pan:'Enter PAN in the format ABCDE1234F.',
    email:'Enter a valid email address.',phone:'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.',
    'gstInfo.gstNumber':'Enter a 15-character GST number.','gstInfo.registeredName':'Enter the registered business name (up to 35 characters).','gstInfo.address':'Use up to 70 characters for the billing address.',
    'contactInfo.ecn':'Enter the emergency contact name (up to 100 characters).','contactInfo.emails.0':'Enter a valid emergency contact email.','contactInfo.contacts.0':'Enter an emergency contact phone with 10–20 characters.',
  };
  return messages[field]??fallback;
}

/** Includes the existing schema, not a second looser browser-only contract. */
export function guestDetailsIssues(input:unknown,search:PartySearch|undefined,review:GuestReview):GuestIssue[] {
  const parsed=guestSchema.safeParse(input);
  if(!parsed.success)return uniqueIssues(parsed.error.issues.map(issue=>({path:issue.path.join('.'),message:schemaIssueMessage(issue.path.join('.'),issue.message)})));
  if(!search)return [{path:'travellers',message:'The reviewed journey details are unavailable. Refresh the reviewed price before continuing.'}];
  return uniqueIssues([...partyIssues(search,parsed.data),...reviewGuestIssues(parsed.data,review)]);
}

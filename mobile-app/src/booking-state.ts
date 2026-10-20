/** Booking-state helpers. Recovery stores only an opaque quote ID, never private payloads. */
export type Guest = {ti:"Mr"|"Ms"|"Mrs"|"Master"|"Miss";pt:"ADULT"|"CHILD"|"INFANT";fN:string;lN:string;dob?:string;pNum?:string;eD?:string;pNat?:string;pan?:string;roomIndex?:number};
export type SearchForm = {
  product:"FLIGHT"|"HOTEL"; from:string; to:string; date:string; end:string;
  adults:string; children:string; infants:string; returnDate:string; multiCity:boolean;
  extraLegs:{from:string;to:string;date:string}[];
  hotelIds:string; nationality:string; hotelRooms:{adults:string;ages:string}[];
};

export function createRequestGate() {
  let generation = 0;
  let controller:AbortController|undefined;
  return {
    cancel() { generation += 1; controller?.abort(); controller = undefined; },
    begin() {
      controller?.abort();
      const current = ++generation;
      const requestController = new AbortController();
      controller = requestController;
      return {
        signal: requestController.signal,
        isCurrent: () => current === generation && !requestController.signal.aborted,
      };
    },
  };
}
export type RequestContext = ReturnType<ReturnType<typeof createRequestGate>["begin"]>;

export type RecoveryStorage={get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>};
/** Persist only an opaque, account-scoped quote ID, before any create request. */
export function createPaymentRecovery(storage:RecoveryStorage,key:string|null) {
  let hydrated=false;
  let quoteId:string|null=null;
  let clearing:Promise<void>|null=null;
  let hydration:Promise<void>|null=null;
  return {
    snapshot:()=>({hydrated,quoteId}),
    isBlocked:()=>!hydrated||quoteId!==null||clearing!==null,
    async hydrate(){
      if(hydrated)return;
      if(hydration)return hydration;
      hydration=(async()=>{quoteId=key?await storage.get(key):null;hydrated=true;})();
      try{await hydration;}finally{hydration=null;}
    },
    async start(id:string){
      if(!key||!hydrated||quoteId!==null||clearing!==null)return false;
      quoteId=id;
      await storage.set(key,id);
      return true;
    },
    async verified(expectedQuoteId:string){
      if(quoteId!==expectedQuoteId)return;
      if(clearing)return clearing;
      clearing=(async()=>{if(key)await storage.remove(key);if(quoteId===expectedQuoteId)quoteId=null;})();
      try{await clearing;}finally{clearing=null;}
    },
  };
}

export function mergeTripPage<T extends {id:string;created_at:string}>(current:T[], incoming:T[], page:number):T[] {
  return Array.from(new Map([...(page === 1 ? [] : current), ...incoming].map(trip => [trip.id, trip])).values())
    .sort((a,b) => b.created_at.localeCompare(a.created_at));
}

export function isQuoteExpired(expiresAt:string, now=Date.now()) {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

function integer(value:string, min:number, max:number, label:string) {
  if (!/^\d+$/.test(value.trim())) throw Error(`Enter a whole number for ${label}.`);
  const count = Number(value);
  if (!Number.isInteger(count) || count < min || count > max) throw Error(`Check ${label} (${min}–${max}).`);
  return count;
}
function dateValue(value:string, label:string, today:string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw Error(`Enter a valid ${label} as YYYY-MM-DD.`);
  if (value < today) throw Error(`${label} cannot be in the past.`);
  return value;
}
const adult = (roomIndex?:number):Guest => ({ti:"Mr",pt:"ADULT",fN:"",lN:"",...(roomIndex === undefined ? {} : {roomIndex})});
const child = (roomIndex?:number):Guest => ({ti:"Master",pt:"CHILD",fN:"",lN:"",...(roomIndex === undefined ? {} : {roomIndex})});

/** Match the supplier/backend calendar regardless of the device's time zone. */
export function indiaCalendarDay(now=new Date()) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}

/** Payload and traveller layout are built together from the same validated form. */
export function createSearchSnapshot(form:SearchForm, today=indiaCalendarDay()) {
  const date = dateValue(form.date, form.product === "FLIGHT" ? "departure date" : "check-in date", today);
  if (form.product === "HOTEL") {
    const checkOut = dateValue(form.end, "check-out date", today);
    if (checkOut <= date) throw Error("Check-out must be after check-in.");
    const hotelIds = form.hotelIds.split(",").map(value => value.trim()).filter(Boolean);
    if (!hotelIds.length) throw Error("Select a destination before searching.");
    if (!form.nationality) throw Error("Select a guest nationality.");
    if (form.hotelRooms.length < 1 || form.hotelRooms.length > 4) throw Error("Choose between 1 and 4 rooms.");
    const rooms = form.hotelRooms.map((room,index) => {
      const adults = integer(room.adults,1,4,`adults in room ${index+1}`);
      const ages = room.ages.trim() ? room.ages.split(",") : [];
      if (ages.length > 3) throw Error(`Room ${index+1} supports up to 3 children.`);
      const childAge = ages.map(age => integer(age,0,17,`child ages in room ${index+1}`));
      return {adults,children:childAge.length,childAge};
    });
    const guests = rooms.flatMap((room,roomIndex) => [
      ...Array.from({length:room.adults},() => adult(roomIndex)),
      ...room.childAge.map(() => child(roomIndex)),
    ]);
    return {payload:{product:form.product,hotelIds,checkIn:date,checkOut,adults:rooms[0].adults,rooms,childrenAges:rooms[0].childAge,nationality:form.nationality},guests,
      summary:`${date} → ${checkOut} · ${rooms.length} room${rooms.length === 1 ? "" : "s"} · ${guests.length} guests`};
  }
  const adults = integer(form.adults,1,9,"adults");
  const children = integer(form.children,0,8,"children");
  const infants = integer(form.infants,0,adults,"infants");
  if (adults+children > 9) throw Error("Choose up to 9 adults and children per flight search.");
  const legs = [{from:form.from,to:form.to,date},...(form.multiCity ? form.extraLegs : [])].map((leg,index) => {
    const from=leg.from.trim().toUpperCase(),to=leg.to.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw Error(`Select both airports for flight ${index+1}.`);
    if (from === to) throw Error(`Choose different airports for flight ${index+1}.`);
    return {from,to,date:dateValue(leg.date,`departure date for flight ${index+1}`,today)};
  });
  if (form.multiCity && (legs.length < 2 || legs.length > 6)) throw Error("Choose between 2 and 6 flights for multi-city.");
  if (legs.some((leg,index) => index > 0 && leg.date < legs[index-1].date)) throw Error("Multi-city flights must be in date order.");
  const returnDate = !form.multiCity && form.returnDate ? dateValue(form.returnDate,"return date",today) : undefined;
  if (returnDate && returnDate < date) throw Error("Return date cannot be before departure.");
  const guests:Guest[] = [...Array.from({length:adults},() => adult()),...Array.from({length:children},() => child()),...Array.from({length:infants},():Guest => ({ti:"Master",pt:"INFANT",fN:"",lN:""}))];
  return {payload:{product:form.product,...legs[0],adults,children,infants,...(form.multiCity ? {legs} : returnDate ? {returnDate} : {}),cabin:"ECONOMY"},guests,
    summary:`${legs.map(leg => `${leg.from} → ${leg.to}`).join(" · ")} · ${date}${returnDate ? ` → ${returnDate}` : ""} · ${guests.length} traveller${guests.length === 1 ? "" : "s"}`};
}

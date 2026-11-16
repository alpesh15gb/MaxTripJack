import 'server-only';
import {z} from 'zod';
import airports from '@/data/airports.json';
import {searchSchema,day} from './providers/contracts';
import {bookingSearchUrl} from './booking-search-state';
import {indiaToday,estimatedFare,journeyMinutes,flightStops,groupLabel,orderedGroups,type Flight} from './booking-presentation';
import {travelDateLabel,travelTimeLabel} from './travel-date';
import {packageSlug} from './travel-packages';
import {getPublicPage} from './public-pages';
import type {PublicBusinessProfile} from './business-profile';
import {bookingStatusView} from './booking-status';
import {isMaxAiActionHref,type MaxAiAction,type MaxAiCard} from './max-ai-contract';

const query=z.string().trim().min(2).max(80);
const empty=z.object({}).strict();
const leg=z.object({from:z.string().regex(/^[A-Z]{3}$/),to:z.string().regex(/^[A-Z]{3}$/),date:day}).strict();
const room=z.object({adults:z.number().int().min(1).max(4),childAge:z.array(z.number().int().min(0).max(17)).max(3)}).strict();
const taskPages={
  flights:['Search flights','/book?product=FLIGHT'],hotels:['Search hotels','/book?product=HOTEL'],
  packages:['Explore holiday packages','/packages'],trips:['Open My trips','/my-trips'],
  cancellation:['Review cancellation options','/my-trips'],refund:['Check payment and refund updates','/my-trips'],
  documents:['Open booking documents','/my-trips'],flight_services:['Manage flight extras or changes','/my-trips'],
  travellers:['Manage saved travellers','/travellers'],account:['Open your account','/account'],
  support:['Contact customer support','/customer-support'],contact:['Contact MaxTravel','/contact'],
  visa:['Read the visa guide','/visa-guide'],passport:['Read the passport guide','/passport-renewal-guide'],
  insurance:['Read the insurance guide','/travel-insurance-guide'],cruise:['Explore cruise guidance','/cruise-holidays-guide'],
  pricing:['Read pricing information','/pricing-transparency'],office:['Visit our office','/office'],
  admin:['Open operations','/operations'],company_settings:['Open company and pricing settings','/operations/settings'],
  promo_codes:['Manage promo codes','/operations/promos'],reports:['Open operations reports','/operations/reports'],
} as const;
const schemas={
  lookup_airports:z.object({query}).strict(),
  lookup_destinations:z.object({query}).strict(),
  lookup_nationalities:z.object({query}).strict(),
  search_flights:z.object({from:z.string().regex(/^[A-Z]{3}$/),to:z.string().regex(/^[A-Z]{3}$/),date:day,returnDate:day.optional(),
    legs:z.array(leg).min(2).max(6).optional(),adults:z.number().int().min(1).max(9),children:z.number().int().min(0).max(8).optional(),infants:z.number().int().min(0).max(9).optional(),
    cabin:z.enum(['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST']).optional(),nonstopOnly:z.boolean().optional(),sort:z.enum(['price','duration','departure']).optional(),airlineQuery:query.optional(),maxTotalRupees:z.number().min(1).max(10000000).optional()}).strict(),
  search_hotels:z.object({regionId:z.string().regex(/^\d{1,30}$/),cursor:z.string().regex(/^\d{1,6}:\d{1,6}$/).optional(),checkIn:day,checkOut:day,
    rooms:z.array(room).min(1).max(4),nationality:z.string().regex(/^\d{1,10}$/),maxStayRupees:z.number().min(1).max(10000000).optional(),nameQuery:query.optional()}).strict(),
  find_packages:z.object({query:query.optional()}).strict(),
  my_trips:empty,
  company_info:empty,
  travel_help:z.object({topic:z.enum(['flights','hotels','booking_confirmation','cancellation','refund','pricing','visa','passport','insurance','cruise','packages'])}).strict(),
  navigate_task:z.object({task:z.enum(Object.keys(taskPages) as [keyof typeof taskPages,...(keyof typeof taskPages)[]])}).strict(),
};
export type MaxAiToolName=keyof typeof schemas;
const descriptions:Record<MaxAiToolName,string>={
  lookup_airports:'Find actual airport codes for a user-provided city or airport. Ask the user to choose if airports are ambiguous; never substitute a nearby airport without asking.',
  lookup_destinations:'Find actual hotel destination region IDs for a user-provided place. Ask which city/country when multiple matches are plausible.',
  lookup_nationalities:'Find the supplier nationality ID for the nationality stated by the user. Do not infer nationality from location or phone number.',
  search_flights:'Search live flight availability with MaxTravel customer prices. Use confirmed airport codes, dates, traveller counts and cabin. Ask for missing facts before calling. One-way, return or multi-city supported. Multi-city requires legs and from/to/date matching the first leg; no returnDate with legs. Prices in separate return groups and maxTotalRupees are per-leg party estimates, not a combined return fare. Sort only known data. airlineQuery applies to all segments. COMBO nonstop/duration filters cannot be established; disclose this limitation.',
  search_hotels:'Search live hotel availability for a destination ID returned by lookup_destinations, confirmed check-in/out, per-room adult counts and child ages, and nationality ID returned by lookup_nationalities. Searches one bounded destination page; never claim exhaustive city inventory. For more results use only the nextCursor returned by the preceding search, retaining region/dates/rooms/nationality.',
  find_packages:'Read the currently published holiday-package catalogue. Optional query filters destination/title. Package indicative prices and availability are not a confirmed reservation.',
  my_trips:'Read the currently signed-in customer’s latest trips. Private references and itinerary details are displayed only in application cards, not sent to the model. Cannot retrieve other users or execute payments, cancellations or refunds.',
  company_info:'Read MaxTravel’s current public company settings: trading name, customer-support contact, office address and hours. Never invent contact details or opening hours.',
  travel_help:'Read concise guidance authored on MaxTravel for booking, prices, payment versus supplier confirmation, visas, passports, insurance and packages. Not a live visa/legal eligibility decision; exact booking cancellation/refund rules require the authenticated booking screen.',
  navigate_task:'Provide a trusted application action for an app task. Sensitive operations continue in the existing authenticated forms and confirmation screens. This tool never changes account, pricing, promo, payment, booking or cancellation state.',
};
export const MAX_AI_TOOL_DEFINITIONS=Object.entries(schemas).map(([name,schema])=>({type:'function' as const,function:{name,description:descriptions[name as MaxAiToolName],parameters:z.toJSONSchema(schema)}}));

export type MaxAiToolResult={model:Record<string,unknown>;cards:MaxAiCard[];actions:MaxAiAction[]};
type Endpoint='airports'|'destinations'|'nationalities'|'destinationHotels'|'search'|'packages'|'bookings';
export type MaxAiToolDispatch=(endpoint:Endpoint,request:Request)=>Promise<Response>;
type Dependencies={dispatch?:MaxAiToolDispatch;now?:()=>Date;companyProfile?:()=>Promise<PublicBusinessProfile>};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const rows=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const text=(value:unknown,max=160)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const safeMinor=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=1_000_000_000?value:undefined;
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const emptyResult=(model:Record<string,unknown>,actions:MaxAiAction[]=[]):MaxAiToolResult=>({model,cards:[],actions});
const uuid=z.string().uuid();
const airportCodes=new Set(airports.map(airport=>airport.code));
const flightSchema=z.object({sI:z.array(z.object({dt:z.string().max(80),at:z.string().max(80),duration:z.number().optional(),isRs:z.boolean().optional(),
  da:z.object({code:z.string().regex(/^[A-Z]{3}$/),name:z.string().max(240).optional(),city:z.string().max(160).optional(),country:z.string().max(80).optional()}),
  aa:z.object({code:z.string().regex(/^[A-Z]{3}$/),name:z.string().max(240).optional(),city:z.string().max(160).optional(),country:z.string().max(80).optional()}),
  fD:z.object({fN:z.preprocess(value=>typeof value==='number'&&Number.isFinite(value)?String(value):value,z.string().max(40)),aI:z.object({name:z.string().max(160),code:z.string().max(8).optional()})})})).min(1).max(12),
  totalPriceList:z.array(z.object({id:z.string().min(1).max(500),fareIdentifier:z.string().max(80).optional().default(''),customerEstimateMinor:z.number().nullable().optional(),currency:z.string().optional(),
    sri:z.string().optional(),msri:z.union([z.string(),z.array(z.string())]).optional(),fD:z.record(z.string(),z.object({cc:z.string().optional(),rT:z.number().optional()}))})).max(100)});

/** Fixed handlers, never arbitrary HTTP, model-provided endpoint paths or privileged DB queries. */
async function dispatch(endpoint:Endpoint,request:Request){
  switch(endpoint){
    case 'airports':return (await import('@/app/api/travel/airports/route')).GET(request);
    case 'destinations':return (await import('@/app/api/travel/destinations/route')).GET(request);
    case 'nationalities':return (await import('@/app/api/travel/nationalities/route')).GET(request);
    case 'destinationHotels':return (await import('@/app/api/travel/destination-hotels/route')).POST(request);
    case 'search':return (await import('@/app/api/travel/search/route')).POST(request);
    case 'packages':return (await import('@/app/api/packages/route')).GET();
    case 'bookings':return (await import('@/app/api/bookings/route')).GET(request);
  }
}
const endpointPaths:Record<Endpoint,string>={airports:'/api/travel/airports',destinations:'/api/travel/destinations',nationalities:'/api/travel/nationalities',destinationHotels:'/api/travel/destination-hotels',search:'/api/travel/search',packages:'/api/packages',bookings:'/api/bookings'};

class ToolUnavailable extends Error{constructor(readonly status:number){super('Application tool unavailable');}}

export function createMaxAiTools(request:Request,dependencies:Dependencies={}){
  const callHandler=dependencies.dispatch??dispatch,now=dependencies.now??(()=>new Date());
  const headers=new Headers(request.headers),changedCookies=new Map<string,string>();
  async function companyProfile(){return dependencies.companyProfile?dependencies.companyProfile():(await import('./company-settings')).getCompanyProfile();}
  async function call(endpoint:Endpoint,payload?:unknown,queryString?:Record<string,string>){
    if(request.signal.aborted)throw new ToolUnavailable(499);
    const url=new URL(endpointPaths[endpoint],request.url);if(queryString)url.search=new URLSearchParams(queryString).toString();
    const nextHeaders=new Headers(headers);nextHeaders.delete('content-length');nextHeaders.delete('transfer-encoding');
    const method=payload===undefined?'GET':'POST';if(payload!==undefined)nextHeaders.set('content-type','application/json');
    const response=await callHandler(endpoint,new Request(url,{method,headers:nextHeaders,...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:request.signal}));
    // Preserve guest search ownership across tools in this turn and the next browser turn.
    for(const cookie of response.headers.getSetCookie()){
      const pair=cookie.split(';',1)[0],separator=pair.indexOf('=');if(separator<1)continue;
      const name=pair.slice(0,separator);changedCookies.set(name,cookie);
      const previous=(headers.get('cookie')??'').split(';').map(value=>value.trim()).filter(value=>value&&!value.startsWith(name+'='));
      headers.set('cookie',[...previous,pair].join('; '));
    }
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ToolUnavailable(response.status);}
    return record(await response.json());
  }

  async function run(name:string,args:unknown):Promise<MaxAiToolResult>{
    if(!Object.hasOwn(schemas,name))return emptyResult({status:'unsupported',message:'This action is not available. Use the supported MaxTravel tools.'});
    const parsed=schemas[name as MaxAiToolName].safeParse(args);
    if(!parsed.success)return emptyResult({status:'needs_input',message:'Ask the user for the missing or invalid search details.',fields:parsed.error.issues.map(issue=>issue.path.join('.')).slice(0,8)});
    try{
      switch(name as MaxAiToolName){
        case 'lookup_airports':{
          const input=schemas.lookup_airports.parse(args),data=await call('airports',undefined,{q:input.query});
          const matches=rows(data.airports).slice(0,12).map(value=>{const item=record(value);return {code:text(item.code,3),name:text(item.name),city:text(item.city),country:text(item.country,60)};}).filter(item=>airportCodes.has(item.code));
          return emptyResult({status:'ok',airports:matches,notice:'These are distinct airports. Do not silently substitute nearby airports.'});
        }
        case 'lookup_destinations':{
          const input=schemas.lookup_destinations.parse(args),data=await call('destinations',undefined,{q:input.query});
          const matches=rows(data.destinations).slice(0,20).map(value=>{const item=record(value);return {regionId:text(item.region_id,30),name:text(item.name),country:text(item.country,80),label:text(item.label)};}).filter(item=>/^\d{1,30}$/.test(item.regionId));
          return emptyResult({status:'ok',destinations:matches});
        }
        case 'lookup_nationalities':{
          const input=schemas.lookup_nationalities.parse(args),data=await call('nationalities'),needle=normalize(input.query);
          const matches=rows(data.nationalities).map(value=>{const item=record(value);return {nationality:text(item.countryId,10),name:text(item.name,80),code:text(item.code,3)};})
            .filter(item=>/^\d{1,10}$/.test(item.nationality)&&(normalize(item.name).includes(needle)||normalize(item.code)===needle)).slice(0,10);
          return emptyResult({status:'ok',nationalities:matches});
        }
        case 'search_flights':{
          const {nonstopOnly,sort='price',airlineQuery,maxTotalRupees,...input}=schemas.search_flights.parse(args);
          if(!airportCodes.has(input.from)||!airportCodes.has(input.to)||input.legs?.some(leg=>!airportCodes.has(leg.from)||!airportCodes.has(leg.to)))return emptyResult({status:'needs_input',message:'Resolve the actual airports with lookup_airports before searching.'});
          const criteria=searchSchema.parse({product:'FLIGHT',...input});
          if(criteria.product!=='FLIGHT')throw new Error('product');
          if(criteria.date<indiaToday(now())||criteria.from===criteria.to||(criteria.returnDate&&criteria.returnDate<criteria.date))return emptyResult({status:'needs_input',message:'Choose different airports and valid future travel dates, with return on or after departure.'});
          const data=await call('search',criteria),searchId=uuid.parse(data.searchId),rawGroups=record(record(record(data.results).searchResult).tripInfos);
          const groups:Record<string,Flight[]>={};
          for(const [group,values] of Object.entries(rawGroups)){
            if(!['ONWARD','RETURN','COMBO'].includes(group)&&!/^\d{1,2}$/.test(group))continue;
            groups[group]=rows(values).slice(0,1000).flatMap(value=>{const valid=flightSchema.safeParse(value);return valid.success?[valid.data as Flight]:[];})
              .filter(flight=>!nonstopOnly||group==='COMBO'||flightStops(flight,group)===0)
              .filter(flight=>!airlineQuery||flight.sI.every(segment=>normalize(`${segment.fD.aI.name} ${segment.fD.aI.code??''}`).includes(normalize(airlineQuery))))
              .filter(flight=>maxTotalRupees===undefined||estimatedFare(flight)<=Math.round(maxTotalRupees*100))
              .sort((a,b)=>sort==='duration'&&group!=='COMBO'?(journeyMinutes(a,group)??Infinity)-(journeyMinutes(b,group)??Infinity):sort==='departure'?a.sI[0].dt.localeCompare(b.sI[0].dt):estimatedFare(a)-estimatedFare(b));
          }
          const href='/book?'+new URLSearchParams({product:'FLIGHT',flightSearch:searchId}),action={label:'Compare flights and fares',href};
          const cards:MaxAiCard[]=[],summaries:Record<string,unknown>[]=[];
          const travellers=criteria.adults+criteria.children+criteria.infants;
          for(const group of orderedGroups(groups)){
            const groupCards=groups[group].slice(0,3).map((flight,index)=>{
              const first=flight.sI[0],last=flight.sI.at(-1)!,amount=safeMinor(estimatedFare(flight)),minutes=journeyMinutes(flight,group),stops=flightStops(flight,group);
              const title=[...new Set(flight.sI.map(segment=>text(segment.fD.aI.name)))].join(' + ');
              const basis=`Estimated ${groupLabel(group).toLowerCase()} total · ${travellers} traveller${travellers===1?'':'s'}`;
              const details=[`${travelDateLabel(first.dt)} · ${travelTimeLabel(first.dt)}–${travelTimeLabel(last.at)} (airport local times)`,
                ...(first.dt.slice(0,10)!==last.at.slice(0,10)?[`Arrives ${travelDateLabel(last.at)}`]:[]),
                ...(group==='COMBO'?['Complete itinerary; inspect all included flights before choosing.']:[`${stops===0?'Non-stop':`${stops} stop${stops===1?'':'s'}`}${minutes!==null?` · ${Math.floor(minutes/60)}h ${minutes%60}m`:''}`]),
                'Availability, baggage, cancellation terms and final price are checked at review.'];
              summaries.push({group,airline:title,from:first.da.code,to:last.aa.code,departure:first.dt,arrival:last.at,priceMinor:amount??null,currency:'INR',priceBasis:basis,stops,durationMinutes:minutes});
              return {id:`${searchId}:${group}:${index}`,type:'flight' as const,title,subtitle:`${groupLabel(group)} · ${first.da.code} → ${last.aa.code}`,details,...(amount!==undefined?{priceMinor:amount,currency:'INR',basis}:{}),action};
            });cards.push(...groupCards);
          }
          return {model:{status:'ok',product:'FLIGHT',checkedAt:now().toISOString(),criteria:{...criteria,...(nonstopOnly?{nonstopOnly}:{}),sort,...(airlineQuery?{airlineQuery}:{}),...(maxTotalRupees!==undefined?{maxTotalRupees}:{})},unsupportedFilters:groups.COMBO?.length?[...(nonstopOnly?['nonstopOnly']:[]),...(sort==='duration'?['durationSort']:[])]:[],groupCounts:Object.fromEntries(Object.entries(groups).map(([key,value])=>[key,value.length])),results:summaries,
            notice:'Customer price estimates only. Return-group fares require compatibility checks and are not a combined return total. Cards open the same owned search; select and review on the booking screen.'},cards:cards.slice(0,12),actions:[action]};
        }
        case 'search_hotels':{
          const input=schemas.search_hotels.parse(args);
          if(input.checkIn<indiaToday(now())||input.checkOut<=input.checkIn)return emptyResult({status:'needs_input',message:'Choose check-in today or later and check-out after check-in.'});
          const nationalityData=await call('nationalities');
          if(!rows(nationalityData.nationalities).some(value=>text(record(value).countryId,10)===input.nationality))return emptyResult({status:'needs_input',message:'Resolve the user’s stated nationality with lookup_nationalities.'});
          const mapping=await call('destinationHotels',{regionId:input.regionId,...(input.cursor?{cursor:input.cursor}:{})});
          const hotelIds=rows(mapping.hotelIds).map(value=>String(value)).filter(value=>/^\d{1,30}$/.test(value)).slice(0,100);
          const label=text(mapping.label),nextCursor=typeof mapping.nextCursor==='string'&&/^\d{1,6}:\d{1,6}$/.test(mapping.nextCursor)?mapping.nextCursor:null;
          // A fresh destination handoff starts at page zero. A region without IDs
          // needs this cursor for the normal search form's destination validity.
          const continuation=bookingSearchUrl({product:'HOTEL',regionId:input.regionId,city:label,destinationCursor:'0:0',date:input.checkIn,end:input.checkOut,adults:String(input.rooms[0].adults),rooms:JSON.stringify(input.rooms),nationality:input.nationality,autoSearch:'1'},indiaToday(now()));
          if(!hotelIds.length)return emptyResult({status:'ok',product:'HOTEL',criteria:{...input,destination:label},destination:label,checkedPropertyCount:0,availableCount:0,moreDestinationPages:mapping.hasMore===true,nextCursor,results:[],notice:'No properties were mapped in the checked destination page. This does not establish that the destination has no availability. Continue with the returned nextCursor when available.'},continuation?[{label:'Explore destination stays',href:continuation}]:[{label:'Search other stays',href:'/book?product=HOTEL'}]);
          const rooms=input.rooms.map(value=>({...value,children:value.childAge.length}));
          const criteria=searchSchema.parse({product:'HOTEL',hotelIds,checkIn:input.checkIn,checkOut:input.checkOut,rooms,adults:rooms[0].adults,childrenAges:rooms[0].childAge,nationality:input.nationality});
          const data=await call('search',criteria),searchId=uuid.parse(data.searchId),guestCount=rooms.reduce((sum,value)=>sum+value.adults+value.childAge.length,0);
          const basis=`Estimated full stay · ${rooms.length} room${rooms.length===1?'':'s'} · ${guestCount} guest${guestCount===1?'':'s'}`;
          const results=rows(record(data.results).hotels).map(record).filter(hotel=>hotelIds.includes(text(hotel.tjHotelId,30)))
            .filter(hotel=>!input.nameQuery||normalize(text(hotel.name)).includes(normalize(input.nameQuery)))
            .filter(hotel=>input.maxStayRupees===undefined||(safeMinor(hotel.customerEstimateMinor)??Infinity)<=Math.round(input.maxStayRupees*100))
            .sort((a,b)=>(safeMinor(a.customerEstimateMinor)??Infinity)-(safeMinor(b.customerEstimateMinor)??Infinity));
          const cards=results.slice(0,6).map((hotel,index)=>{
            const id=text(hotel.tjHotelId,30),price=safeMinor(hotel.customerEstimateMinor),property=record(hotel.property);
            const action={label:'View rooms and rates',href:'/book?'+new URLSearchParams({product:'HOTEL',browseSearch:searchId,stay:id})};
            return {id:`${searchId}:${index}`,type:'hotel' as const,title:text(hotel.name)||'Hotel',subtitle:label,details:[`${travelDateLabel(input.checkIn)}–${travelDateLabel(input.checkOut)}`,text(property.address,200),
              'Meals, cancellation conditions and current room prices are checked when you choose a rate.'].filter(Boolean),...(price!==undefined?{priceMinor:price,currency:'INR',basis}:{}),action};
          });
          const browse={label:'Compare all checked stays',href:'/book?'+new URLSearchParams({product:'HOTEL',browseSearch:searchId})};
          return {model:{status:'ok',product:'HOTEL',checkedAt:now().toISOString(),criteria:{...input,destination:label},destination:label,checkedPropertyCount:hotelIds.length,availableCount:results.length,moreDestinationPages:mapping.hasMore===true,nextCursor,
            results:cards.map(card=>({name:card.title,priceMinor:card.priceMinor??null,currency:'INR',priceBasis:basis})),notice:'One bounded destination page was checked, not all hotels in the city. Prices are full-stay customer estimates; conditions and current prices require room review.'},cards,actions:[browse,...(mapping.hasMore===true&&continuation?[{label:'Explore more destination stays',href:continuation}]:[])]};
        }
        case 'find_packages':{
          const input=schemas.find_packages.parse(args),data=await call('packages'),needle=normalize(input.query??'');
          const packages=rows(data.packages).map(record).filter(item=>packageSlug.safeParse(item.slug).success&&normalize(`${text(item.title)} ${text(item.destination)}`).includes(needle));
          const cards=packages.slice(0,6).map((item,index)=>{
            const price=typeof item.priceAmount==='number'?safeMinor(Math.round(item.priceAmount*100)):undefined;
            return {id:`package:${text(item.slug)}:${index}`,type:'package' as const,title:text(item.title),subtitle:text(item.destination),details:[text(item.summary,280),`${Number(item.durationDays)||0} days · ${Number(item.durationNights)||0} nights`,
              item.availability==='UNAVAILABLE'?'Not currently available':'Availability and final quote require confirmation.'].filter(Boolean),...(price!==undefined?{priceMinor:price,currency:text(item.currency,3),basis:`Indicative package price · ${text(item.priceBasis).toLowerCase().replaceAll('_',' ')}`} :{}),action:{label:'View package details',href:'/packages/'+text(item.slug)}};
          });
          return {model:{status:'ok',packages:cards.map(card=>({title:card.title,destination:card.subtitle,priceMinor:card.priceMinor??null,currency:card.currency,priceBasis:card.basis})),notice:'These are published package indications, not confirmed availability or reservations.'},cards,actions:[{label:'Browse all packages',href:'/packages'}]};
        }
        case 'my_trips':{
          const data=await call('bookings',undefined,{page:'1'}),bookings=rows(data.bookings).map(record).filter(item=>uuid.safeParse(item.id).success);
          const cards=bookings.slice(0,8).map(item=>{const itinerary=record(item.itinerary_summary),hotel=item.product==='HOTEL';
            return {id:'trip:'+String(item.id),type:'trip' as const,title:text(item.reference,40)||'Your booking',subtitle:hotel?'Hotel booking':'Flight booking',
              details:[bookingStatusView({product:text(item.product,10),status:text(item.status,60),paymentStatus:null,totalMinor:text(item.total_minor,24),serviceKind:null}).title,hotel?text(itinerary.hotelName)||text(itinerary.city):[text(itinerary.from,3),text(itinerary.to,3)].filter(Boolean).join(' → '),
                text(hotel?itinerary.checkIn:itinerary.date,10),'Open the booking for separate payment, supplier confirmation and refund updates.'].filter(Boolean),action:{label:'View booking and available actions',href:'/my-trips/'+String(item.id)}};
          });
          // Private records remain in customer-only UI cards, never provider/model context.
          return {model:{status:'ok',count:bookings.length,hasMore:data.hasMore===true,notice:'The customer’s own trip cards are shown securely in the app. Do not infer payment, supplier confirmation or refund success from this summary; ask them to open a booking for verified updates.'},cards,actions:[{label:'Open all My trips',href:'/my-trips'}]};
        }
        case 'company_info':{
          const profile=await companyProfile();
          return emptyResult({status:'ok',company:{name:text(profile.name,100),phone:text(profile.phoneE164,25),email:text(profile.email,200),address:text(profile.address.display,500),hours:text(profile.hours.display,240),timezone:'Asia/Kolkata'},
            notice:'Public company settings only. These support hours do not guarantee immediate response or supplier outcomes.'},[{label:'Contact MaxTravel',href:'/contact'},{label:'Office details',href:'/office'}]);
        }
        case 'travel_help':{
          const {topic}=schemas.travel_help.parse(args);
          const slugs={flights:'flight-booking-guide',hotels:'pricing-transparency',booking_confirmation:'pricing-transparency',cancellation:'pricing-transparency',refund:'pricing-transparency',pricing:'pricing-transparency',visa:'visa-guide',passport:'passport-renewal-guide',insurance:'travel-insurance-guide',cruise:'cruise-holidays-guide',packages:'holiday-packages-guide'} as const;
          const guide=getPublicPage(slugs[topic],await companyProfile());
          if(!guide)throw new Error('Guide unavailable');
          const confirmation=['booking_confirmation','cancellation','refund'].includes(topic);
          const sections=confirmation?guide.sections.filter(section=>section.heading==='Payment and booking are different outcomes'):guide.sections.slice(0,2);
          const guidance=sections.slice(0,2).map(section=>({heading:text(section.heading,160),points:[...(section.paragraphs??[]),...(section.bullets??[])].slice(0,5).map(value=>text(value,1000))}));
          return emptyResult({status:'ok',topic,title:guide.title,intro:guide.intro,reviewedAt:guide.reviewedAt,guidance,
            notice:'Authored planning guidance, not current legal, visa, insurance eligibility or a booking-specific refund promise. Payment receipt never establishes flight ticketing or hotel supplier confirmation. The selected fare/room and verified booking status govern.'},
            [{label:'Read the full guide',href:'/'+guide.slug},...(confirmation?[{label:'Check your booking and current terms',href:'/my-trips'},{label:'Cancellation and payment policy',href:'/cancellations-payment-policy'}]:[])]);
        }
        case 'navigate_task':{
          const input=schemas.navigate_task.parse(args),[label,href]=taskPages[input.task];
          return emptyResult({status:'ok',task:input.task,notice:'This is navigation only. The existing page checks access and asks for confirmation before sensitive changes; no action has been executed.'},[{label,href}]);
        }
      }
    }catch(error){
      if(error instanceof ToolUnavailable){
        if(error.status===401)return emptyResult({status:'sign_in_required',message:'Sign in through MaxTravel to access your own bookings; never ask for passwords or verification codes in chat.'},[{label:'Sign in securely',href:'/account'}]);
        if(error.status===403)return emptyResult({status:'access_required',message:'This account or session cannot access that action. Complete verification or use the existing account page.'},[{label:'Check your account',href:'/account'}]);
        if(error.status===429)return emptyResult({status:'rate_limited',message:'The service has reached its request limit. Wait before trying again; do not automatically retry.'});
      }
      return emptyResult({status:'unavailable',message:'The live application service could not complete this check. Do not invent results, prices or success. Offer the existing search or support screen.'},[{label:'Search flights',href:'/book?product=FLIGHT'},{label:'Search hotels',href:'/book?product=HOTEL'},{label:'Get support',href:'/customer-support'}]);
    }
  }
  return {run:async(name:string,args:unknown)=>{const result=await run(name,args);return {...result,cards:result.cards.filter(card=>isMaxAiActionHref(card.action.href)),actions:result.actions.filter(action=>isMaxAiActionHref(action.href))};},cookies:()=>[...changedCookies.values()]};
}

import {currentPackageSummary,type TravelPackage} from './travel-packages';

const quoteDetails = {
 currency:'INR', priceAmount:null, priceBasis:'ON_REQUEST', priceNotes:'Tell us your dates and group size for a tailored quote.', priceValidUntil:'',
 taxesIncluded:false, availability:'ON_REQUEST', travelStart:'', travelEnd:'',
 availabilityNotes:'This is a sample itinerary. The team can confirm what is available for your dates.',
 inclusions:['Your quote can include accommodation, transfers and sightseeing based on your preferences.'],
 exclusions:['Flights, meals and activities depend on the inclusions agreed in your quote.'],
 terms:'An enquiry starts a conversation with our travel team. The written quote will include the exact itinerary, inclusions and applicable terms.',
 cancellationPolicy:'The team will explain the cancellation terms for the flights, stays and activities included in your quote.',
 gallery:[], contactEmail:'', contactPhone:'', publishedAt:'2026-11-22T00:00:00.000Z',
} satisfies Partial<TravelPackage>;

const tripIdeas: readonly TravelPackage[] = [
 {
  ...quoteDetails,
  id:'plan-goa-coast', slug:'plan-goa-coast',
  title:'A long weekend in Goa', destination:'Goa, India',
  summary:'Make time for the coast, Old Goa and a wander through Panaji.',
  description:'Spend four days in Goa with a mix of beach time and sightseeing. Ask our team to help choose a base near the places you want to visit.',
  durationDays:4, durationNights:3, coverImageUrl:'/travel/goa.jpg', coverImageAlt:'A beach in Goa',
  itinerary:[
   {day:1,title:'Arrive and settle in',description:'Check in and spend your first evening getting to know the neighbourhood around your stay.'},
   {day:2,title:'Old Goa and Panaji',description:'Plan a visit to the churches of Old Goa, then walk through Panaji’s Fontainhas neighbourhood.'},
   {day:3,title:'A day on the coast',description:'Choose a beach day or build in time for a local market and a Goan meal.'},
   {day:4,title:'Departure',description:'Leave time for checkout and your journey to the airport or station.'},
  ],
 },
 {
  ...quoteDetails,
  id:'plan-dubai-city-break', slug:'plan-dubai-city-break',
  title:'A Dubai city break', destination:'Dubai, United Arab Emirates',
  summary:'Explore neighbourhoods on both sides of Dubai Creek and spend an evening downtown.',
  description:'Build a four-day Dubai stay around the places you want to see. Our team can help plan transfers and suggest options for your free day.',
  durationDays:4, durationNights:3, coverImageUrl:'/travel/dubai.jpg', coverImageAlt:'Dubai skyline and Burj Khalifa',
  itinerary:[
   {day:1,title:'Arrive in Dubai',description:'Check in and explore the area around your stay.'},
   {day:2,title:'Dubai Creek and Downtown',description:'Visit the old neighbourhoods near the creek and allow the evening for Downtown Dubai.'},
   {day:3,title:'Choose your own day',description:'Ask the team about a desert outing, a beach day or more time to explore the city.'},
   {day:4,title:'Departure',description:'Plan your checkout and airport transfer around your flight time.'},
  ],
 },
];

export function planningPackage(slug:string){
 return tripIdeas.find(item=>item.slug===slug);
}

export function planningPackageSummaries(){
 return tripIdeas.map(item=>currentPackageSummary(item));
}

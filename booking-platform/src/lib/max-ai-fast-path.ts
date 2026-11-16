/** Narrow first-turn shortcuts. Detailed or ambiguous requests still use the model. */
export function maxAiFastPath(message:string,hasHistory:boolean):{reply:string}|{tool:'my_trips'}|null{
  const value=message.trim().toLowerCase().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
  if(['my bookings','my trips','show my bookings','show me my bookings','show me my trips','show me my bookings and their current status','check my bookings'].includes(value))return {tool:'my_trips'};
  if(hasHistory)return null;
  if(['hi','hello','hey','namaste'].includes(value))return {reply:'Hello! I’m Max AI. I can help with flights, hotels, visas, travel insurance, holiday packages, cruises or an existing booking. What are you planning?'};
  const request=value.replace(/^(?:please )?(?:i (?:want|need|would like)(?: to (?:book|buy|find|plan|apply for))?|help me (?:find|book|plan|apply for)|(?:find|book|plan|buy))\s+/,'').replace(/^(?:a|an|some)\s+/,'');
  if(['visa','visa assistance'].includes(request))return {reply:'MaxTravel can help with visa enquiries. Which country are you visiting, what is your passport nationality, and is the trip for tourism, business or another purpose? Please include your intended travel month or dates if known.'};
  if(['insurance','travel insurance'].includes(request))return {reply:'I can help prepare a travel-insurance enquiry. Where are you travelling, what are your dates or approximate duration, and how many travellers are there with their ages? Keep medical records and passport numbers out of chat.'};
  if(['holiday','holiday package','holiday packages','vacation','vacation package'].includes(request))return {reply:'Let’s plan your holiday. Where would you like to go, which city will you depart from, and when? Tell me the number of adults and children, plus your budget if you have one. Flexible dates and an undecided destination are fine.'};
  if(['cruise','cruises','cruise holiday','cruise holidays'].includes(request))return {reply:'I can help with a cruise enquiry. Do you have a destination or departure port in mind, which month would you like to sail, and how many adults and children will travel? Add the number of nights or budget if known.'};
  if(['flight','flights','flight ticket','flight tickets','air ticket'].includes(request))return {reply:'Where will you fly from and to, and on what departure date? Let me know if you need a return trip. If you’re travelling alone, we can start with one adult in economy.'};
  if(['hotel','hotels','hotel room','stay'].includes(request))return {reply:'Which destination, check-in and check-out dates, and how many rooms do you need? Please include adults and children in each room, children’s ages, and the guests’ nationality so I can check the right rates.'};
  if(['my next trip','a trip','trip'].includes(request))return {reply:'Do you have a destination in mind, or would you like ideas? Tell me your departure city, approximate dates, who is travelling and the kind of holiday or budget you prefer.'};
  return null;
}

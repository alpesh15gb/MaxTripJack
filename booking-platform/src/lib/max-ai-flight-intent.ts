import airports from '@/data/airports.json';

/** Deterministic first-turn flight search: "flights from Mumbai to Delhi tomorrow".
 * Only unambiguous single-airport cities (or explicit codes) and an explicit date
 * qualify; anything else returns null and the model asks as before. */
export type FlightIntent={from:string;to:string;date:string;adults:number;cabin:'ECONOMY'|'PREMIUM_ECONOMY'|'BUSINESS'|'FIRST'};

const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9/ -]/g,' ').replace(/\s+/g,' ').trim();
// Common names whose primary airport is clear. Multi-airport places (Goa, London…) stay ambiguous.
const aliases:Record<string,string>={delhi:'DEL','new delhi':'DEL',bombay:'BOM',mumbai:'BOM',bangalore:'BLR',bengaluru:'BLR',hyderabad:'HYD',madras:'MAA',calcutta:'CCU',cochin:'COK',dubai:'DXB',trivandrum:'TRV',thiruvananthapuram:'TRV',gurgaon:'DEL',gurugram:'DEL',noida:'DEL'};
const codes=new Set(airports.map(airport=>airport.code));
const byCity=new Map<string,string[]>();
for(const airport of airports){const key=normalize(airport.city);if(key)byCity.set(key,[...(byCity.get(key)??[]),airport.code]);}

export function resolveAirport(raw:string,original=''):string|null{
 const value=normalize(raw).replace(/\b(airport|city|international)\b/g,'').trim();
 // A bare three-letter word is a code only when typed in capitals ("goa" is not Genoa).
 if(/^[a-z]{3}$/.test(value)&&codes.has(value.toUpperCase())&&original.split(/[^A-Za-z]+/).includes(value.toUpperCase()))return value.toUpperCase();
 if(aliases[value])return aliases[value];
 const matches=byCity.get(value);
 return matches?.length===1?matches[0]:null;
}

const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const iso=(time:number)=>new Date(time).toISOString().slice(0,10);
const at=(date:string)=>Date.parse(`${date}T00:00:00Z`);

export function resolveDate(raw:string,today:string):string|null{
 const value=normalize(raw).replace(/^(on|for|this|the)\s+/,'').replace(/\s+(please|pls)$/,'');
 if(value==='today')return today;
 if(value==='tomorrow')return iso(at(today)+86_400_000);
 if(value==='day after tomorrow')return iso(at(today)+2*86_400_000);
 const next=/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(value);
 if(next){const target=weekdays.indexOf(next[2]),current=new Date(at(today)).getUTCDay();let delta=(target-current+7)%7||7;if(next[1]&&delta<7)delta+=7;return iso(at(today)+delta*86_400_000);}
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return valid(value,today);
 let day:number|undefined,month:number|undefined,year:number|undefined;
 const dm=/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]{3,9})(?: (\d{4}))?$/.exec(value);
 const md=/^([a-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(value);
 const slash=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(value);
 if(dm){day=Number(dm[1]);month=months.indexOf(dm[2].slice(0,3));year=dm[3]?Number(dm[3]):undefined;}
 else if(md){day=Number(md[2]);month=months.indexOf(md[1].slice(0,3));year=md[3]?Number(md[3]):undefined;}
 else if(slash){day=Number(slash[1]);month=Number(slash[2])-1;year=slash[3]?Number(slash[3]):undefined;}
 if(day===undefined||month===undefined||month<0||month>11)return null;
 const thisYear=Number(today.slice(0,4));
 const build=(y:number)=>`${y}-${String(month!+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 if(year!==undefined)return valid(build(year),today);
 return valid(build(thisYear),today)??valid(build(thisYear+1),today);
}
function valid(date:string,today:string){const time=at(date);if(!Number.isFinite(time)||iso(time)!==date||date<today||time-at(today)>360*86_400_000)return null;return date;}

const numbers:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,a:1,an:1};
export function maxAiFlightIntent(message:string,hasHistory:boolean,today:string):FlightIntent|null{
 if(hasHistory||message.length>160||/\b(return|round ?trip|back on|child|children|kid|infant|baby|multi|via|and then)\b/i.test(message))return null;
 let text=normalize(message).replace(/^(please |pls |hi |hey )+/,'');
 let cabin:FlightIntent['cabin']='ECONOMY';
 if(/\bpremium economy\b/.test(text))cabin='PREMIUM_ECONOMY';else if(/\bbusiness\b/.test(text))cabin='BUSINESS';else if(/\bfirst class\b/.test(text))cabin='FIRST';
 text=text.replace(/\b(in )?(premium economy|economy|business( class)?|first class)\b/g,' ').replace(/\s+/g,' ').trim();
 let adults=1;
 const party=/\b(?:for )?(\d|one|two|three|four|five|six|seven|eight|nine|a|an) (?:adults?|people|persons?|passengers?|pax|travell?ers?)\b/.exec(text);
 if(party){adults=Number(party[1])||numbers[party[1]]||1;text=text.replace(party[0],' ').replace(/\s+/g,' ').trim();}
 if(adults<1||adults>9)return null;
 const match=/^(?:(?:show|find|search|book|get|i (?:want|need)|cheap(?:est)?|any)(?: me)?(?: (?:a|the|some|cheap|cheapest))? )?(?:(?:flights?|air ?tickets?|tickets?|fly|plane) )?(?:from )?([a-z0-9 ]{3,40}?) to ([a-z0-9 ]{3,40}?) (?:on |for )?((?:day after )?tomorrow|today|(?:next )?[a-z]+day|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?(?: of)? [a-z]{3,9}(?: \d{4})?|[a-z]{3,9} \d{1,2}(?:st|nd|rd|th)?(?: \d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{4})?)(?: flights?)?$/.exec(text);
 if(!match)return null;
 const from=resolveAirport(match[1],message),to=resolveAirport(match[2],message),date=resolveDate(match[3],today);
 if(!from||!to||!date||from===to)return null;
 return {from,to,date,adults,cabin};
}

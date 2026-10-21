import {estimatedFare,type Flight} from './booking-presentation';
/** Calendar dates are local to their airports. This is not an elapsed-time calculation. */
export function arrivalDayLabel(departure:string,arrival:string):string|null{
 const day=(value:string)=>{const text=value.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const time=Date.parse(text+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===text?time:null;};
 const start=day(departure),end=day(arrival);if(start===null||end===null)return null;
 const offset=(end-start)/86400000;if(!offset)return null;
 return `${offset>0?'+':''}${offset} calendar day${Math.abs(offset)===1?'':'s'}`;
}
export function matchesFlightRefinements(flight:Flight,group:string,departureWindow:string,budget:string):boolean{
 if(budget.trim()){const limit=Number(budget),price=estimatedFare(flight);if(!Number.isFinite(limit)||limit<0||!Number.isFinite(price)||price>limit*100)return false;}
 if(group==='COMBO'||departureWindow==='ALL')return true;
 const time=flight.sI[0]?.dt.slice(11,16);if(!time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return false;
 const hour=Number(time.slice(0,2));return departureWindow==='EARLY'?hour<6:departureWindow==='MORNING'?hour>=6&&hour<12:departureWindow==='AFTERNOON'?hour>=12&&hour<18:departureWindow==='EVENING'?hour>=18:false;
}

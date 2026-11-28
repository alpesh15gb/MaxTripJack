import {addDays,isDay} from './fare-calendar-core';

const maxAdvanceDays=180;
const indiaDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});

export function isFlightPriceAlertDate(date:unknown,now=new Date()):date is string {
  if(!isDay(date))return false;
  const today=indiaDate.format(now);
  return date>today && date<=addDays(today,maxAdvanceDays);
}

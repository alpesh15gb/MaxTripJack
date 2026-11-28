import {CABINS, isDay, type Cabin} from './fare-calendar-core';
import {isFlightPriceAlertDate} from './flight-price-alert-dates';

export const priceAlertsAccountPath = '/account#flight-price-alerts';
const endpoint = '/api/travel/price-alerts';
export type PriceAlertWatch = {from:string; to:string; date:string; cabin:Cabin};
const statuses = ['waiting','watching','notified','expired','delivery_unknown'] as const;
export type FlightPriceAlert = PriceAlertWatch & {id:string; status:typeof statuses[number]; baselineMinor:number|null; notifiedMinor:number|null};

export function flightPriceAlertWatch(criteria:Record<string,string>):PriceAlertWatch|null {
  if (criteria.product !== 'FLIGHT' || criteria.returnDate || criteria.legs || Number(criteria.adults) !== 1 || Number(criteria.children || 0) || Number(criteria.infants || 0)) return null;
  const {from,to,date}=criteria;
  const cabin=CABINS.find(value=>value===criteria.cabin);
  if (!cabin || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from===to || !isFlightPriceAlertDate(date)) return null;
  return {from,to,date,cabin};
}

export function samePriceWatch(a:PriceAlertWatch,b:PriceAlertWatch) {
  return a.from===b.from && a.to===b.to && a.date===b.date && a.cabin===b.cabin;
}

export const alertStatusLabel:Record<FlightPriceAlert['status'],string> = {
  waiting:'Waiting for first fare check',
  watching:'Watching for a lower fare',
  notified:'Lower fare email sent',
  expired:'Departure date passed',
  delivery_unknown:'Email delivery could not be confirmed',
};

export class PriceAlertRequestError extends Error {
  constructor(message:string,readonly status:number){super(message);}
}

function validAlert(value:unknown):value is FlightPriceAlert {
  if(!value || typeof value!=='object')return false;
  const alert=value as Partial<FlightPriceAlert>;
  return typeof alert.id==='string' && /^[0-9a-f-]{36}$/i.test(alert.id) && typeof alert.from==='string' && /^[A-Z]{3}$/.test(alert.from)
    && typeof alert.to==='string' && /^[A-Z]{3}$/.test(alert.to) && isDay(alert.date) && CABINS.some(value=>value===alert.cabin)
    && statuses.some(status=>status===alert.status) && validAmount(alert.baselineMinor) && validAmount(alert.notifiedMinor);
}

function validAmount(value:unknown) {
  return value===null || typeof value==='number' && Number.isSafeInteger(value) && value>0 && value<=1_000_000_000;
}

async function priceAlertRequest(path:string,method:'GET'|'POST'|'DELETE',signal?:AbortSignal,body?:PriceAlertWatch) {
  const timeout=AbortSignal.timeout(15_000);
  const response=await fetch(path,{method,cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout,
    ...(body&&{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}).catch(()=>{
    throw new Error('We couldn’t reach price alerts. Check your alerts before trying again.');
  });
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw new PriceAlertRequestError(typeof json?.error==='string'?json.error:'Price alerts are unavailable right now. Try again shortly.',response.status);
  return json;
}

export async function listFlightPriceAlerts(signal?:AbortSignal):Promise<{available:boolean;alerts:FlightPriceAlert[]}> {
  const result=await priceAlertRequest(endpoint,'GET',signal);
  if(typeof result?.available!=='boolean' || !Array.isArray(result.alerts) || !result.alerts.every(validAlert))throw Error('We couldn’t read the current price alerts.');
  return {available:result.available,alerts:result.alerts};
}

export async function subscribeFlightPriceAlert(watch:PriceAlertWatch,signal?:AbortSignal) {
  const result=await priceAlertRequest(endpoint,'POST',signal,watch);
  if(!validAlert(result?.alert) || !samePriceWatch(result.alert,watch))throw Error('We couldn’t confirm the alert. Check your alert list before trying again.');
  return result.alert;
}

export async function stopFlightPriceAlert(id:string,signal?:AbortSignal) {
  const result=await priceAlertRequest(`${endpoint}/${encodeURIComponent(id)}`,'DELETE',signal);
  if(result?.deleted!==true)throw Error('We couldn’t confirm the change. Check your alert list before trying again.');
}

import {airportInstant} from './airport-instant';
const cache=new Map<string,number|null>();
/** Bounded cache for repeated sorting of public itinerary timestamps. */
export function flightInstant(value:string,airport:{code:string;country?:string}):number|null {
 const key=JSON.stringify([value,airport.code,airport.country]);
 if(cache.has(key))return cache.get(key)!;
 const iso=airportInstant(value,airport.code,airport.country),instant=iso===null?null:Date.parse(iso);
 if(cache.size>=2048)cache.clear();
 cache.set(key,instant);return instant;
}

import catalogue from './airline-logos.json';
const logos:Record<string,{name:string;file:string}[]>=catalogue;
const normalize=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
export function airlineLogo(code?:string,name=''){
 const normalized=code?.trim().toUpperCase()??'';
 if(!/^[A-Z0-9]{2}$/.test(normalized))return null;
 const candidates=logos[normalized];
 if(!candidates)return null;
 // Shared/reassigned codes require a matching supplier name to avoid the wrong brand.
 const match=candidates.length===1?candidates[0]:candidates.find(item=>normalize(item.name)===normalize(name));
 return match?`/airlines/${match.file}`:null;
}

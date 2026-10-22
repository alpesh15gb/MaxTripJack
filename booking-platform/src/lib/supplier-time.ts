/** Strict supplier calendar parsing. Never supply an implicit machine timezone.
 * defaultOffset is permitted only for an independently documented contract. */
export function supplierInstant(value: unknown, defaultOffset?: '+05:30'): number | null {
  if(typeof value!=='string')return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if(!match)return null;
  const [,ys,ms,ds,hs,mins,ss,,zone]=match;
  const year=Number(ys),month=Number(ms),day=Number(ds),hour=Number(hs),minute=Number(mins),second=Number(ss??0);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)return null;
  const offset=zone??defaultOffset;
  // Unknown local offsets are outside the supplier display contract.
  if(!offset||offset==='-00:00'||offset==='-0000')return null;
  if(offset!=='Z'){
    const digits=offset.replace(':','');const hours=Number(digits.slice(1,3)),minutes=Number(digits.slice(3,5));
    if(hours>14||minutes>59||(hours===14&&minutes!==0))return null;
  }
  const result=Date.parse(zone?value:value+offset);
  return Number.isFinite(result)?result:null;
}
export function suppliedMinutes(value:unknown):number|null {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
}

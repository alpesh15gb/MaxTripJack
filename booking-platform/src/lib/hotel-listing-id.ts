/** Listing endpoint identity adapter.
 * Observed UAT listing returns hotelId; older/documented fixtures use tjHotelId.
 * Mapping and static-content endpoint contracts are deliberately unchanged.
 */
export function hotelListingId(source:unknown):string|undefined {
 if(source===null||typeof source!=='object'||Array.isArray(source))return undefined;
 const hotel=source as Record<string,unknown>;
 const present=['hotelId','tjHotelId'].filter(key=>Object.prototype.hasOwnProperty.call(hotel,key));
 if(!present.length)return undefined;
 const values=present.map(key=>{
  const raw=hotel[key];
  if(typeof raw==='number')return Number.isSafeInteger(raw)&&raw>0?String(raw):undefined;
  if(typeof raw!=='string'||!/^\d+$/.test(raw))return undefined;
  const numeric=Number(raw);
  return Number.isSafeInteger(numeric)&&numeric>0&&String(numeric)===raw?raw:undefined;
 });
 // A conflicting or malformed alias must never redirect a property selection.
 if(values.some(value=>value===undefined)||new Set(values).size!==1)return undefined;
 return values[0];
}

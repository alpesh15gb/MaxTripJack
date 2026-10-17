/** Match each selected fare to its server-stored journey group; preserve route order. */
export function orderedFlightSelection(groups:Record<string,unknown>,ids:string[],criteria:{returnDate?:string;legs?:unknown[]}) {
 const valid=new Map<string,{group:string;fareIdentifier?:string;sri?:string;msri?:string|string[]}>();
 for(const [group,trips] of Object.entries(groups))if(Array.isArray(trips))for(const trip of trips)for(const price of trip.totalPriceList??[])valid.set(price.id,{...price,group});
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!valid.has(id)))throw Error("Select fares from the current search.");
 const required=Array.isArray(groups.COMBO)&&groups.COMBO.length?["COMBO"]:criteria.legs?Object.keys(groups).filter(key=>Array.isArray(groups[key])&&(groups[key] as unknown[]).length).sort((a,b)=>Number(a)-Number(b)):criteria.returnDate?["ONWARD","RETURN"]:["ONWARD"];
 if(criteria.legs&&required[0]!=="COMBO"&&(required.length!==criteria.legs.length||required.some(key=>!/^\d+$/.test(key))))throw Error("Supplier multi-city route groups are incomplete. Search again.");
 if(ids.length!==required.length||required.some(group=>ids.filter(id=>valid.get(id)!.group===group).length!==1))throw Error("Select one fare for every journey leg.");
 const ordered=required.map(group=>ids.find(id=>valid.get(id)!.group===group)!);
 const selected=ordered.map(id=>valid.get(id)!);
 if(selected.some(p=>p.fareIdentifier==="SPECIAL_RETURN")){
  const onward=selected.find(p=>p.group==="ONWARD"),back=selected.find(p=>p.group==="RETURN");
  if(!onward||!back||selected.some(p=>p.fareIdentifier!=="SPECIAL_RETURN")||!onward.sri||!back.msri?.includes(onward.sri))throw Error("Special return fares must be a matching pair.");
 }
 return ordered;
}

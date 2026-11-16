export type DestinationHotelPage={hotelIds:string[];nextCursor:string|null};

/** Commit cursor only after availability succeeds. Empty mapping pages still advance. */
export async function nextHotelSearchPage<T>(cursor:string,map:(cursor:string)=>Promise<DestinationHotelPage>,search:(ids:string[])=>Promise<T>){
  const mapping=await map(cursor);
  const result=mapping.hotelIds.length?await search(mapping.hotelIds):null;
  return {result,nextCursor:mapping.nextCursor};
}

/** The first received rate keeps the server search that owns it, including duplicates. */
export function appendHotelSearchPage<T extends {tjHotelId:string;originSearchId?:string}>(existing:T[],baseSearchId:string,incoming:T[],searchId:string):(T&{originSearchId:string})[]{
  const known=new Set(existing.map(hotel=>hotel.tjHotelId));
  return [...existing.map(hotel=>({...hotel,originSearchId:hotel.originSearchId??baseSearchId})),...incoming.filter(hotel=>{if(known.has(hotel.tjHotelId))return false;known.add(hotel.tjHotelId);return true;}).map(hotel=>({...hotel,originSearchId:searchId}))];
}

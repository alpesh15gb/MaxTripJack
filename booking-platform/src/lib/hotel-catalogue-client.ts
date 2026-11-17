import {catalogueEnvironment, catalogueHotelId, type HotelCatalogueEnvironment} from './hotel-catalogue';
import type {HotelCatalogueClient} from './hotel-catalogue-sync';

type Fetcher = typeof fetch;
export class HotelCatalogueSupplierError extends Error {
  constructor(public readonly code:'CONFIGURATION'|'TIMEOUT_OR_NETWORK'|'HTTP_FAILURE'|'INVALID_RESPONSE',public readonly httpStatus?:number) {
    super('Hotel catalogue supplier request could not be completed.'); this.name='HotelCatalogueSupplierError';
  }
}

/** Fixed approved supplier endpoints only. This client never changes booking-provider configuration. */
export function createHotelCatalogueClient(options: {
  env?:Readonly<Record<string,string|undefined>>;
  fetcher?:Fetcher;
  wait?:(milliseconds:number)=>Promise<void>;
} = {}): HotelCatalogueClient & {environment:HotelCatalogueEnvironment} {
  const env=options.env ?? process.env;
  const environment=catalogueEnvironment(env);
  const key=env.TRIPJACK_HOTEL_API_KEY?.trim();
  if (!key) throw new HotelCatalogueSupplierError('CONFIGURATION');
  const fetcher=options.fetcher ?? fetch;
  const wait=options.wait ?? (milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)));
  const host=environment==='production' ? 'https://hms-search.tripjack.com' : 'https://apitest-hms.tripjack.com';
  const limit=16*1024*1024;
  async function request(path:string,payload?:unknown):Promise<unknown> {
    for (let attempt=0;attempt<3;attempt++) {
      await wait(250);
      let response:Response;
      try {
        response=await fetcher(host+path,{method:payload===undefined?'GET':'POST',headers:{apikey:key!,'Content-Type':'application/json',Accept:'application/json'},
          ...(payload===undefined?{}:{body:JSON.stringify(payload)}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20_000)});
      } catch { throw new HotelCatalogueSupplierError('TIMEOUT_OR_NETWORK'); }
      if ((response.status===429 || response.status===503) && attempt<2) {
        await response.body?.cancel();
        const retry=Number(response.headers.get('retry-after'));
        await wait(Number.isFinite(retry) && retry>0 ? Math.min(10_000,retry*1000) : 1_000*(attempt+1));
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new HotelCatalogueSupplierError('HTTP_FAILURE',response.status); }
      if (Number(response.headers.get('content-length'))>limit) { await response.body?.cancel(); throw new HotelCatalogueSupplierError('INVALID_RESPONSE'); }
      const reader=response.body?.getReader();
      if (!reader) throw new HotelCatalogueSupplierError('INVALID_RESPONSE');
      const chunks:Uint8Array[]=[];let length=0;
      try {
        for (;;) { const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>limit){await reader.cancel();throw new HotelCatalogueSupplierError('INVALID_RESPONSE');}chunks.push(part.value); }
      } catch(error) {
        if (error instanceof HotelCatalogueSupplierError) throw error;
        throw new HotelCatalogueSupplierError('TIMEOUT_OR_NETWORK');
      } finally { reader.releaseLock(); }
      const bytes=new Uint8Array(length);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      let parsed:unknown;
      try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HotelCatalogueSupplierError('INVALID_RESPONSE');}
      if (!parsed || typeof parsed!=='object' || Array.isArray(parsed) || (parsed as {status?:{success?:unknown}}).status?.success!==true) throw new HotelCatalogueSupplierError('INVALID_RESPONSE');
      return parsed;
    }
    throw new HotelCatalogueSupplierError('HTTP_FAILURE');
  }
  return {environment,
    countries:()=>request('/hms/v3/content/fetch-countries'),
    mapping:(countryName,page)=>{
      if (!countryName || countryName.length>120 || !Number.isInteger(page) || page<0 || page>100_000) throw new HotelCatalogueSupplierError('CONFIGURATION');
      return request('/hms/v3/content/fetch-hotel-mapping',{countryName,page,size:2_000});
    },
    content:hotelIds=>{
      if (!hotelIds.length || hotelIds.length>100 || new Set(hotelIds).size!==hotelIds.length || hotelIds.some(id=>!catalogueHotelId(id))) throw new HotelCatalogueSupplierError('CONFIGURATION');
      return request('/hms/v3/content/fetch-hotel-content',{hotelIds,isAllImagesRequired:true});
    },
  };
}

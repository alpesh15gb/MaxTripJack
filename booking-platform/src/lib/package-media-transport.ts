import {PACKAGE_MEDIA_ID} from './package-media';
const MAX_IMAGE_BYTES=3*1024*1024;
export class PackageMediaError extends Error {
 constructor(public readonly status:404|503){super(status===404?'Package image unavailable.':'Package image temporarily unavailable.');}
}
/** Fixed public asset endpoint, no arbitrary URL proxy. Producer verifies current published references. */
export async function fetchPackageMedia(id:string,fetcher:typeof fetch=fetch):Promise<Uint8Array>{
 if(!PACKAGE_MEDIA_ID.test(id))throw new PackageMediaError(404);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
 try{
  const response=await fetcher(`https://crm.maxtravel.in/api/public/package-media/${id}`,{signal:controller.signal,redirect:'error',cache:'no-store',headers:{Accept:'image/webp'}});
  const rejectResponse=async(error:Error):Promise<never>=>{await response.body?.cancel().catch(()=>{});throw error;};
  if(response.status===404)return await rejectResponse(new PackageMediaError(404));
  if(!response.ok||response.headers.get('content-type')?.toLowerCase()!=='image/webp'||!response.body)return await rejectResponse(new Error('image response'));
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_IMAGE_BYTES))return await rejectResponse(new Error('image size'));
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_IMAGE_BYTES)throw new Error('image limit');chunks.push(part.value);}}finally{try{await reader.cancel();}finally{reader.releaseLock();}}
  if(size<20||declared!==null&&Number(declared)!==size)throw new Error('image length');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const text=(start:number,end:number)=>new TextDecoder().decode(bytes.slice(start,end));
  if(text(0,4)!=='RIFF'||text(8,12)!=='WEBP'||!['VP8 ','VP8L','VP8X'].includes(text(12,16))||new DataView(bytes.buffer).getUint32(4,true)+8!==size)throw new Error('image signature');
  return bytes;
 }catch(error){if(error instanceof PackageMediaError)throw error;throw new PackageMediaError(503);}finally{clearTimeout(timer);controller.abort();}
}

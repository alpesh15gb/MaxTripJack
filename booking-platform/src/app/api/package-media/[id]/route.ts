import {fetchPackageMedia,PackageMediaError} from '@/lib/package-media-transport';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;const bytes=await fetchPackageMedia(id);
  return new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':'image/webp','Content-Length':String(bytes.length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
 }catch(error){return Response.json({error:'Package image unavailable.'},{status:error instanceof PackageMediaError?error.status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}

import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import sharp from 'sharp';
import {administrator} from '@/lib/access';
import {transaction} from '@/lib/db';
import {boundedText,failure,HttpError,json,sameOrigin} from '@/lib/http';
import {companySettingsSchema} from '@/lib/company-settings-schema';
import {readCompanySettings} from '@/lib/company-settings';
export async function GET(request:Request){try{await administrator(request,'companies:manage');return json(await readCompanySettings());}catch(e){return failure(e);}}
export async function PUT(request:Request){try{
 sameOrigin(request);const actor=await administrator(request,'companies:manage');
 if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'JSON required.');
 let raw:unknown;try{raw=JSON.parse(await boundedText(request,550000));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Malformed JSON.');}
 const input=z.object({version:z.number().int().min(0),settings:companySettingsSchema}).strict().parse(raw);
 if(input.settings.logoDataUrl){
  try{const bytes=Buffer.from(input.settings.logoDataUrl.split(',')[1],'base64');
   const image=sharp(bytes,{limitInputPixels:4000000});const meta=await image.metadata();
   if(!['png','jpeg'].includes(meta.format??'')||(meta.pages??1)>1)throw Error('Unsupported logo');
   const png=await image.rotate().resize({width:600,height:200,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   if(png.length>300000)throw Error('Logo too large');input.settings.logoDataUrl=`data:image/png;base64,${png.toString('base64')}`;
  }catch{throw new HttpError(400,'Choose a PNG or JPEG logo under 350 KB and 4 megapixels.');}
 }
 return json(await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(71266302)');
  const old=(await tx.query('SELECT settings,version FROM company_settings WHERE singleton=true')).rows[0];
  if((old?.version??0)!==input.version)throw new HttpError(409,'Settings changed since you opened this page. Reload before saving again.');
  const result=await tx.query('INSERT INTO company_settings(singleton,settings,version,updated_by) VALUES(true,$1,1,$2) ON CONFLICT(singleton) DO UPDATE SET settings=excluded.settings,version=company_settings.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING version,updated_at',[JSON.stringify(input.settings),actor.userId]);
  await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'COMPANY_SETTINGS_UPDATED',$3,$4)",[randomUUID(),actor.userId,'00000000-0000-4000-8000-000000000021',{version:result.rows[0].version,before:old?auditSettings(old.settings):null,after:auditSettings(input.settings)}]);
  return {settings:input.settings,version:result.rows[0].version,updatedAt:result.rows[0].updated_at};
 }));
}catch(e){return failure(e);}}

function auditSettings(settings:Record<string,unknown>){const {logoDataUrl,...details}=settings;return {...details,logoSha256:typeof logoDataUrl==='string'&&logoDataUrl?createHash('sha256').update(logoDataUrl).digest('hex'):null};}

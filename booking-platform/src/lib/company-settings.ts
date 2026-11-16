import 'server-only';
import {database} from './db';
import {companySettingsSchema,defaultCompanySettings,profileFromSettings} from './company-settings-schema';
export async function readCompanySettings(){
 const result=await database().query('SELECT settings,version,updated_at FROM company_settings WHERE singleton=true');
 const row=result.rows[0];
 return {settings:row?companySettingsSchema.parse(row.settings):defaultCompanySettings,version:row?.version??0,updatedAt:row?.updated_at??null};
}
/** No process cache: updates are visible to the app and mail workers on their next read. */
export async function getCompanyProfile(){
 try{return profileFromSettings((await readCompanySettings()).settings);}
 catch(error){
  // Allow deployment before this additive migration; do not mask connectivity or validation failures.
  if(!process.env.DATABASE_URL||(error as {code?:string}).code==='42P01')return profileFromSettings(defaultCompanySettings);
  throw error;
 }
}

import {randomBytes} from 'node:crypto';
import * as fs from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual,parseArgs,parseEnv} from 'node:util';

export const DEFAULT_SAFAR_URL='https://crm.maxtravel.in/api/integrations/max-ai/enquiries';
const safeFailure=message=>Object.assign(new Error(message),{safeSetupError:true});
const fail=message=>{throw safeFailure(message);};
const own=(value,key)=>Object.hasOwn(value,key);

export function validSafarUrl(value){
  try{const url=new URL(value);return !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/api/integrations/max-ai/enquiries'&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname));}catch{return false;}
}

// Locate dotenv assignments without interpreting or rewriting unrelated values.
// Quoted multiline values are kept as one record. parseEnv verifies every edit.
function envRecords(source){
  const records=[];let offset=0;
  while(offset<source.length){
    let end=source.indexOf('\n',offset);if(end<0)end=source.length;else end++;
    const first=source.slice(offset,end),match=/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*/.exec(first);
    if(match){
      const start=offset+match[0].length,quote=source[start];
      if(quote==='\''||quote==='"'||quote==='`'){
        const close=source.indexOf(quote,start+1);
        if(close<0)fail('An environment file has an unterminated quoted value. No settings were changed.');
        end=source.indexOf('\n',close);if(end<0)end=source.length;else end++;
      }
    }
    records.push({key:match?.[1],raw:source.slice(offset,end)});offset=end;
  }
  return records;
}

function literal(value){
  if(/[\r\n\0']/.test(value))fail('A managed setting cannot be safely encoded. No settings were changed.');
  return `'${value}'`;
}

export function updateEnv(source,updates){
  const before=parseEnv(source),records=envRecords(source),seen=new Set(),newline=source.includes('\r\n')?'\r\n':'\n';
  let output='';
  for(const record of records){
    if(record.key&&own(updates,record.key)){
      if(seen.has(record.key))fail('A managed environment setting is duplicated. Remove the duplicate before setup.');
      seen.add(record.key);
      output+=before[record.key]===updates[record.key]?record.raw:`${record.key}=${literal(updates[record.key])}${newline}`;
    }else output+=record.raw;
  }
  for(const [key,value] of Object.entries(updates))if(!seen.has(key)){
    if(output&&!output.endsWith('\n'))output+=newline;
    output+=`${key}=${literal(value)}${newline}`;
  }
  const after=parseEnv(output);
  if(!isDeepStrictEqual(after,{...before,...updates}))fail('Environment validation failed. No settings were changed.');
  return output;
}

async function existingFile(path){
  if(typeof path!=='string'||!isAbsolute(path))fail('Both environment paths must be explicit absolute paths to existing files.');
  let stat,source,canonical;
  try{
    stat=await fs.lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1024*1024)throw Error();
    canonical=join(await fs.realpath(dirname(path)),basename(path));
    source=await fs.readFile(path,'utf8');
  }catch{fail('An environment file is missing, unreadable or unsafe. No files or directories were created.');}
  return {path:canonical,source,stat,values:parseEnv(source)};
}

async function privateWrite(path,source,stat){
  const handle=await fs.open(path,'wx',0o600);
  try{
    if(process.platform!=='win32')await handle.chown(stat.uid,stat.gid);
    await handle.chmod(0o600);await handle.writeFile(source,'utf8');await handle.sync();
  }finally{await handle.close();}
}

function receiverKeys(raw){
  if(!raw)return {};
  let keys;try{keys=JSON.parse(raw);}catch{fail('The Safar signing-key map is invalid. No settings were changed.');}
  if(!keys||typeof keys!=='object'||Array.isArray(keys)||Object.keys(keys).length>10||Object.entries(keys).some(([id,key])=>!/^[A-Za-z0-9._-]{1,80}$/.test(id)||typeof key!=='string'||key.length<32||key.length>4096||/[\r\n\0]/.test(key)))fail('The Safar signing-key map is invalid. No settings were changed.');
  return keys;
}

/** Offline only. Existing runtime env files are updated; no services or databases are contacted. */
export async function configureSafarEnquiries({bookingEnvPath,safarEnvPath,url=DEFAULT_SAFAR_URL},{rename=fs.rename}={}){
  if(!validSafarUrl(url))fail('Use the dedicated HTTPS Safar enquiry endpoint. No settings were changed.');
  const [booking,safar]=await Promise.all([existingFile(bookingEnvPath),existingFile(safarEnvPath)]);
  if(booking.path===safar.path||booking.stat.dev===safar.stat.dev&&booking.stat.ino===safar.stat.ino)fail('Booking and Safar must use separate environment files.');
  const b=booking.values;
  if(b.SAFAR_ENQUIRY_MODE&&b.SAFAR_ENQUIRY_MODE!=='test')fail('Existing live or invalid enquiry mode requires manual review. Setup only configures test mode.');
  if(b.SAFAR_ENQUIRY_URL&&b.SAFAR_ENQUIRY_URL!==url)fail('A different enquiry destination is already configured. No settings were changed.');
  const keys=receiverKeys(safar.values.SAFAR_MAX_AI_SIGNING_KEYS);
  let keyId=b.SAFAR_ENQUIRY_KEY_ID,key=b.SAFAR_ENQUIRY_SIGNING_KEY;
  if(Boolean(keyId)!==Boolean(key))fail('The booking signing pair is incomplete. No settings were changed.');
  const preserved=Boolean(keyId&&key);
  if(preserved){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)||key.length<32||key.length>4096||/[\r\n\0]/.test(key))fail('The booking signing pair is invalid. No settings were changed.');
    if(own(keys,keyId)&&keys[keyId]!==key)fail('Booking and Safar signing keys do not match. No settings were changed.');
  }else{
    keyId='maxtravel_'+randomBytes(8).toString('hex');key=randomBytes(32).toString('hex');
  }
  if(!own(keys,keyId)&&Object.keys(keys).length>=10)fail('The Safar signing-key map is full. No settings were changed.');
  Object.defineProperty(keys,keyId,{value:key,enumerable:true,writable:true,configurable:true});
  // Unicode-escape apostrophes inside JSON so single-quoted dotenv keeps both
  // Node and Docker Compose from expanding dollar signs in existing keys.
  const encodedKeys=JSON.stringify(keys).replaceAll("'",'\\u0027');
  const bookingAfter=updateEnv(booking.source,{SAFAR_ENQUIRY_URL:url,SAFAR_ENQUIRY_KEY_ID:keyId,SAFAR_ENQUIRY_SIGNING_KEY:key,SAFAR_ENQUIRY_MODE:'test'});
  const safarAfter=safar.values.SAFAR_MAX_AI_SIGNING_KEYS&&isDeepStrictEqual(receiverKeys(safar.values.SAFAR_MAX_AI_SIGNING_KEYS),keys)
    ?updateEnv(safar.source,{SAFAR_MAX_AI_SIGNING_KEYS:safar.values.SAFAR_MAX_AI_SIGNING_KEYS})
    :updateEnv(safar.source,{SAFAR_MAX_AI_SIGNING_KEYS:encodedKeys});
  const files=[{...safar,after:safarAfter},{...booking,after:bookingAfter}].filter(file=>file.source!==file.after);
  if(!files.length)return {changed:false,mode:'test',signingPairPreserved:true,filesChanged:0,privateBackups:0,legacyCrmUnchanged:true};
  const suffix=`${new Date().toISOString().replace(/[-:.]/g,'')}-${randomBytes(6).toString('hex')}`,staged=[],replaced=[];
  let rollbackFailed=false;
  try{
    // Stage and back up both before replacing either. Every file is private,
    // stays on its original filesystem, and retains the original owner.
    for(const file of files){
      file.stage=`${file.path}.max-ai-stage-${suffix}`;file.backup=`${file.path}.max-ai-backup-${suffix}`;
      staged.push(file.stage);await privateWrite(file.stage,file.after,file.stat);
      await privateWrite(file.backup,file.source,file.stat);
    }
    for(const file of files){
      const current=await fs.lstat(file.path);
      if(!current.isFile()||current.isSymbolicLink()||current.ino!==file.stat.ino||current.dev!==file.stat.dev||await fs.readFile(file.path,'utf8')!==file.source)throw Error('concurrent_edit');
    }
    // Receiver first: a crash between replacements only leaves an extra key;
    // it never points the booking sender at an unprepared receiver.
    for(const file of files){await rename(file.stage,file.path);replaced.push(file);}
  }catch{
    for(const file of replaced.reverse()){
      const rollback=`${file.path}.max-ai-rollback-${suffix}`;staged.push(rollback);
      try{await privateWrite(rollback,file.source,file.stat);await fs.rename(rollback,file.path);}catch{rollbackFailed=true;}
    }
    fail(rollbackFailed?'Setup failed and rollback needs review. Private max-ai-backup files preserve the original settings. Do not restart services.':'Setup could not finish. Original environment contents were preserved; private backups may remain. No services were restarted.');
  }finally{
    for(const path of staged)await fs.unlink(path).catch(()=>{});
  }
  return {changed:true,mode:'test',signingPairPreserved:preserved,filesChanged:files.length,privateBackups:files.length,legacyCrmUnchanged:true};
}

export async function runConfigureSafarEnquiries(args=process.argv.slice(2),output=console){
  try{
    const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{'booking-env':{type:'string'},'safar-env':{type:'string'},url:{type:'string'}}});
    const result=await configureSafarEnquiries({bookingEnvPath:values['booking-env'],safarEnvPath:values['safar-env'],url:values.url});
    output.log('Safar enquiry setup',result);return 0;
  }catch(error){
    output.error(error?.safeSetupError?error.message:'Setup failed. Check the explicit environment paths and file permissions. No secret values are displayed.');return 1;
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)void runConfigureSafarEnquiries().then(code=>{process.exitCode=code;});

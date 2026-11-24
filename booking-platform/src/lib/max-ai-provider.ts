import 'server-only';
import type {MaxAiMessage} from './max-ai-conversation';

export type MaxAiGatewayConfig = {baseURL:string; apiKey:string; model:string};
export type MaxAiFunction = {type:'function';function:{name:string;description:string;parameters:Record<string,unknown>}};
type ProviderMessage = MaxAiMessage | {role:'system';content:string};
export type MaxAiAssistantMessage=Extract<MaxAiMessage,{role:'assistant'}>;
export class MaxAiProviderError extends Error {
  constructor(public reason:'configuration'|'http'|'response'|'timeout'|'transport',public status?:number){
    super('Max AI could not reach its assistant service. Please try again shortly.');
    this.name='MaxAiProviderError';
  }
}

export function maxAiGatewayConfiguration(env:Readonly<Record<string,string|undefined>>=process.env):MaxAiGatewayConfig|null{
  if(env.MAX_AI_ENABLED!=='true')return null;
  const base=env.MAX_AI_BASE_URL?.trim(),apiKey=env.MAX_AI_API_KEY?.trim(),model=env.MAX_AI_MODEL?.trim()||'apexv1';
  if(!base||!apiKey||apiKey.length>4096||/[\r\n\0]/.test(apiKey)||!model||model.length>120||/[\s\u0000-\u001f]/.test(model))return null;
  try{
    const url=new URL(base);
    // Operator-owned only. Never accept a gateway, key or model from chat input.
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return null;
    return {baseURL:url.toString().replace(/\/+$/,''),apiKey,model};
  }catch{return null;}
}

async function readJSON(response:Response):Promise<unknown>{
  const limit=96*1024;
  if(!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json')||Number(response.headers.get('content-length'))>limit){
    void response.body?.cancel().catch(()=>{});throw new MaxAiProviderError('response');
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){void reader.cancel().catch(()=>{});throw new MaxAiProviderError('response');}chunks.push(value);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new MaxAiProviderError('response');}
  }finally{reader.releaseLock();}
}

export function parseMaxAiCompletion(value:unknown):MaxAiAssistantMessage{
  const data=value as {choices?:{message?:{role?:unknown;content?:unknown;tool_calls?:unknown}}[]}|null;
  const message=data?.choices?.[0]?.message;
  if(!message||message.role!=='assistant'||(message.content!==null&&message.content!==undefined&&typeof message.content!=='string'))throw new MaxAiProviderError('response');
  const content=typeof message.content==='string'?message.content.trim():null;
  if(content&&content.length>6000)throw new MaxAiProviderError('response');
  const calls=message.tool_calls;
  if(calls!==undefined&&(!Array.isArray(calls)||calls.length>6))throw new MaxAiProviderError('response');
  const seen=new Set<string>();
  const tool_calls=(calls as unknown[]|undefined)?.map(item=>{
    const call=item as {id?:unknown;type?:unknown;function?:{name?:unknown;arguments?:unknown}};
    if(call?.type!=='function'||typeof call.id!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(call.id)||seen.has(call.id)||typeof call.function?.name!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(call.function.name)||typeof call.function.arguments!=='string'||call.function.arguments.length>4096)throw new MaxAiProviderError('response');
    seen.add(call.id);
    return {id:call.id,type:'function' as const,function:{name:call.function.name,arguments:call.function.arguments}};
  });
  if(!content&&!tool_calls?.length)throw new MaxAiProviderError('response');
  return {role:'assistant',content,...(tool_calls?.length?{tool_calls}:{})};
}

export async function completeMaxAi(messages:ProviderMessage[],tools:MaxAiFunction[],options:{signal?:AbortSignal;config?:MaxAiGatewayConfig;fetch?:typeof fetch;timeoutMs?:number}={}):Promise<MaxAiAssistantMessage>{
  const config=options.config??maxAiGatewayConfiguration();
  if(!config)throw new MaxAiProviderError('configuration');
  const timeout=AbortSignal.timeout(options.timeoutMs??15_000);
  const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  try{
    const response=await (options.fetch??fetch)(`${config.baseURL}/chat/completions`,{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:`Bearer ${config.apiKey}`},
      body:JSON.stringify({model:config.model,messages,max_tokens:1200,stream:false,...(tools.length?{tools,tool_choice:'auto'}:{})}),
      redirect:'error',cache:'no-store',signal,
    });
    if(!response.ok){void response.body?.cancel().catch(()=>{});throw new MaxAiProviderError('http',response.status);}
    return parseMaxAiCompletion(await readJSON(response));
  }catch(error){
    if(error instanceof MaxAiProviderError)throw error;
    if(options.signal?.aborted)throw options.signal.reason??new DOMException('Aborted','AbortError');
    throw new MaxAiProviderError(timeout.aborted?'timeout':'transport');
  }
}

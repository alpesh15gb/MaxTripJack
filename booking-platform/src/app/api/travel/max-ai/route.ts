import {z} from 'zod';
import {MAX_AI_SERVER_TIMEOUT_MS} from '@/lib/max-ai-contract';
import {body,failure,HttpError,json,sameOrigin} from '@/lib/http';
import {shoppingAccess,type ShoppingAccess} from '@/lib/guest-shopping';
import {shoppingPeer} from '@/lib/guest-shopping-policy';
import {requestLimit} from '@/lib/request-limit';
import {createMaxAiTools,MAX_AI_TOOL_DEFINITIONS} from '@/lib/max-ai-tools';
import {maxAiGatewayConfiguration,MaxAiProviderError} from '@/lib/max-ai-provider';
import {maxAiSensitiveMessage,runMaxAiTurn} from '@/lib/max-ai-engine';
import {conversationConfigured,MaxAiConversationError,openMaxAiConversation,sealMaxAiConversation} from '@/lib/max-ai-conversation';

export const runtime='nodejs';
export const maxDuration=35;
const inputSchema=z.object({message:z.string().trim().min(1).max(2000),conversationToken:z.string().max(50*1024).optional(),pageContext:z.object({pathname:z.string().max(500)}).strict().optional()}).strict();

function withCookies(response:Response,cookies:string[]){
  const latest=new Map<string,string>();
  for(const cookie of cookies)latest.set(cookie.split('=',1)[0],cookie);
  for(const cookie of latest.values())response.headers.append('Set-Cookie',cookie);
  response.headers.set('X-Content-Type-Options','nosniff');
  return response;
}

const timeoutResponse=()=>json({error:'Max AI took too long to respond. Retry or use flight and hotel search.'},504);

export async function POST(request:Request){
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(MAX_AI_SERVER_TIMEOUT_MS)]);
  if(signal.aborted)return timeoutResponse();
  let onAbort!:()=>void;
  const deadline=new Promise<Response>(resolve=>{
    onAbort=()=>resolve(timeoutResponse());
    signal.addEventListener('abort',onAbort,{once:true});
  });
  try{return await Promise.race([handleTurn(request,signal),deadline]);}
  finally{signal.removeEventListener('abort',onAbort);}
}

async function handleTurn(request:Request,signal:AbortSignal){
  let access:ShoppingAccess|undefined;
  let runner:ReturnType<typeof createMaxAiTools>|undefined;
  const respond=(response:Response)=>withCookies(response,[...(access?.cookie?[access.cookie]:[]),...(runner?.cookies()??[])]);
  try{
    sameOrigin(request);
    const input=await body(request,inputSchema);
    if(!maxAiGatewayConfiguration()||!conversationConfigured())throw new HttpError(503,'Max AI is not connected yet. Please use the flight or hotel search while we finish connecting it.');
    signal.throwIfAborted();
    access=await shoppingAccess(request,'search');
    signal.throwIfAborted();
    const peer=shoppingPeer(request,process.env.PUBLIC_SHOPPING_TRUST_PROXY==='true');
    await requestLimit('max-ai:global','turn',60);
    signal.throwIfAborted();
    await requestLimit(`max-ai:peer:${peer}`,'turn',20);
    signal.throwIfAborted();
    await requestLimit(access.actor.userId,'max-ai:turn',8);
    signal.throwIfAborted();
    const history=input.conversationToken?openMaxAiConversation(input.conversationToken,access.actor):[];
    if(history===null)throw new HttpError(409,'This Max AI chat has expired or belongs to a different session. Start a new chat to continue.');
    if(maxAiSensitiveMessage(input.message))return respond(json({reply:'Keep passwords, verification codes and payment credentials out of chat. Use the secure account or booking screen instead.',cards:[],actions:[{label:'Open your account',href:'/account'}],...(input.conversationToken?{conversationToken:input.conversationToken}:{})}));
    // Seed the tool runner with the just-issued guest cookie before its first tool.
    const headers=new Headers(request.headers);headers.delete('content-length');headers.delete('transfer-encoding');
    if(access.cookie){const pair=access.cookie.split(';',1)[0],name=pair.split('=',1)[0];headers.set('cookie',[...(headers.get('cookie')??'').split(';').map(value=>value.trim()).filter(value=>value&&!value.startsWith(name+'=')),pair].join('; '));}
    runner=createMaxAiTools(new Request(request.url,{headers,signal}));
    const result=await runMaxAiTurn({message:input.message,history,page:input.pageContext?.pathname},{runner,definitions:MAX_AI_TOOL_DEFINITIONS,signal});
    signal.throwIfAborted();
    console.info('Max AI timing',result.metrics);
    let conversationToken:string|undefined,notice=result.notice;
    try{conversationToken=sealMaxAiConversation(result.history,access.actor);}
    catch(error){
      if(!(error instanceof MaxAiConversationError)||error.code!=='TOO_LARGE')throw error;
      // Results remain usable even if a very large turn cannot fit encrypted history.
      notice='These results are ready. Start a new chat for your next request because this conversation reached its size limit.';
    }
    const response=json({reply:result.reply,cards:result.cards,actions:result.actions,...(result.enquiryDraft?{enquiryDraft:result.enquiryDraft}:{}),...(conversationToken?{conversationToken}:{}),...(notice?{notice}:{})});
    if(result.metrics)response.headers.set('Server-Timing',`maxai;dur=${result.metrics.durationMs}, model;dur=${result.metrics.providerMs}, tools;dur=${result.metrics.toolMs}`);
    return respond(response);
  }catch(error){
    if(error instanceof MaxAiProviderError){
      console.error('Max AI gateway',{reason:error.reason,httpStatus:error.status??null});
      if(error.reason==='timeout')return respond(timeoutResponse());
      return respond(json({error:'Max AI is temporarily unavailable. Please try again shortly or use the flight and hotel search.'},503));
    }
    if(signal.aborted||error instanceof DOMException&&['AbortError','TimeoutError'].includes(error.name))return respond(timeoutResponse());
    return respond(failure(error));
  }
}

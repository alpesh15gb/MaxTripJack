import 'server-only';
import {completeMaxAi,type MaxAiFunction,type MaxAiAssistantMessage,MaxAiProviderError} from './max-ai-provider';
import {maxAiSystemPrompt} from './max-ai-prompt';
import {finalizeMaxAiNarrative} from './max-ai-narrative';
import type {MaxAiMessage} from './max-ai-conversation';
import type {MaxAiAction,MaxAiCard} from './max-ai-contract';
import {isMaxAiActionHref} from './max-ai-contract';
import {indiaToday} from './booking-presentation';
export {maxAiSensitiveMessage} from './max-ai-sensitive';

export type MaxAiToolResult={model:Record<string,unknown>;cards:MaxAiCard[];actions:MaxAiAction[]};
export type MaxAiToolRunner={run:(name:string,args:unknown)=>Promise<MaxAiToolResult>};
type Completion=typeof completeMaxAi;
const fallbackActions:MaxAiAction[]=[{label:'Search flights',href:'/book?product=FLIGHT'},{label:'Find a hotel',href:'/book?product=HOTEL'},{label:'My trips',href:'/my-trips'}];

export function maxAiPageContext(value:unknown){
  if(typeof value!=='string'||value.length>120)return '/';
  if(['/','/book','/packages','/my-trips','/account','/travellers','/customer-support','/contact','/services','/operations','/operations/settings','/operations/promos'].includes(value))return value;
  if(value.startsWith('/my-trips/'))return '/my-trips';
  if(value.startsWith('/packages/'))return '/packages';
  return '/';
}

/** Only server-executed tools can create result cards/actions. Model text cannot. */
export async function runMaxAiTurn(input:{message:string;history:MaxAiMessage[];page?:string},options:{runner:MaxAiToolRunner;definitions:MaxAiFunction[];signal?:AbortSignal;complete?:Completion;today?:string}){
  const messages:MaxAiMessage[]=[...input.history,{role:'user',content:input.message}];
  const cards:MaxAiCard[]=[],actions:MaxAiAction[]=[];
  const allowed=new Set(options.definitions.map(tool=>tool.function.name));
  const system={role:'system' as const,content:maxAiSystemPrompt(options.today??indiaToday(),maxAiPageContext(input.page))};
  const signal=options.signal??AbortSignal.timeout(80000);
  let toolCount=0,notice:string|undefined;
  const complete=options.complete??completeMaxAi;
  const finalize=(reply:string)=>{
    const uniqueCards=[...new Map(cards.filter(card=>isMaxAiActionHref(card.action.href)).map(card=>[card.id,card])).values()].slice(0,10);
    const uniqueActions=[...new Map(actions.filter(action=>isMaxAiActionHref(action.href)).map(action=>[action.href,action])).values()].slice(0,5);
    const safe=finalizeMaxAiNarrative(reply,uniqueCards,uniqueActions,input.message);
    messages.push({role:'assistant',content:safe});
    return {reply:safe,cards:uniqueCards,actions:uniqueActions,history:messages,...(notice?{notice}:{})};
  };
  for(let round=0;round<4;round++){
    signal.throwIfAborted();
    let answer:MaxAiAssistantMessage;
    try{answer=await complete([system,...messages],options.definitions,{signal});}
    catch(error){
      if(!(error instanceof MaxAiProviderError)||(!cards.length&&!actions.length))throw error;
      notice='Your app results loaded, but the AI summary is temporarily unavailable.';
      return finalize('Use the options below to continue. Prices and availability will be checked again before payment.');
    }
    const calls=answer.tool_calls??[];
    if(!calls.length)return finalize(answer.content||'Tell me the journey or task you would like help with.');
    // Do not publish unverified pre-tool narration such as "your booking is done".
    messages.push({...answer,content:null});
    for(const call of calls){
      signal.throwIfAborted();
      let result:MaxAiToolResult;
      if(!allowed.has(call.function.name))result={model:{error:'Unsupported action. Use only the supplied travel tools. No action was performed.'},cards:[],actions:[]};
      else if(toolCount>=6)result={model:{error:'This turn has reached its tool budget. Ask the visitor to continue with a more specific request.'},cards:[],actions:[]};
      else{
        toolCount++;
        let args:unknown;
        try{args=JSON.parse(call.function.arguments);}
        catch{result={model:{error:'Tool arguments must be a valid JSON object.'},cards:[],actions:[]};messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result.model)});continue;}
        // Runtime validates exact schemas and dispatches fixed existing application handlers.
        result=await options.runner.run(call.function.name,args);
      }
      cards.push(...result.cards);actions.push(...result.actions);
      const evidence=JSON.stringify(result.model);
      messages.push({role:'tool',tool_call_id:call.id,content:Buffer.byteLength(evidence,'utf8')<=4000?evidence:JSON.stringify({status:'Results are shown in the app cards. Detailed tool output was too large to summarize.'})});
    }
    if(toolCount>=6)break;
  }
  if(!cards.length&&!actions.length)actions.push(...fallbackActions);
  return finalize(cards.length?'Here are the available options from the app. Open one to compare the current prices and conditions.':'I need one more step to finish this search. Tell me any missing dates, airports or guest details, or use the search buttons below.');
}

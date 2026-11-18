import 'server-only';
import {completeMaxAi,type MaxAiFunction,type MaxAiAssistantMessage,MaxAiProviderError} from './max-ai-provider';
import {maxAiSystemPrompt} from './max-ai-prompt';
import {finalizeMaxAiNarrative,maxAiClarificationQuestions} from './max-ai-narrative';
import type {MaxAiMessage} from './max-ai-conversation';
import type {MaxAiAction,MaxAiCard} from './max-ai-contract';
import {isMaxAiActionHref} from './max-ai-contract';
import {indiaToday} from './booking-presentation';
import {maxAiFastPath} from './max-ai-fast-path';
import {maxAiFlightIntent} from './max-ai-flight-intent';
import {enquiryDraftSchema,enquiryServiceLabels,type EnquiryDraft} from './travel-enquiry-contract';
export {maxAiSensitiveMessage} from './max-ai-sensitive';

export type MaxAiToolResult={model:Record<string,unknown>;cards:MaxAiCard[];actions:MaxAiAction[];enquiryDraft?:EnquiryDraft};
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
  const started=performance.now();
  const messages:MaxAiMessage[]=[...input.history,{role:'user',content:input.message}];
  const cards:MaxAiCard[]=[],actions:MaxAiAction[]=[];
  const allowed=new Set(options.definitions.map(tool=>tool.function.name));
  const system={role:'system' as const,content:maxAiSystemPrompt(options.today??indiaToday(),maxAiPageContext(input.page))};
  const signal=options.signal??AbortSignal.timeout(80000);
  let toolCount=0,modelCalls=0,providerMs=0,toolMs=0,notice:string|undefined,enquiryDraft:EnquiryDraft|undefined;
  let fastPath='model';
  const complete=options.complete??completeMaxAi;
  const finalize=(reply:string)=>{
    const uniqueCards=[...new Map(cards.filter(card=>isMaxAiActionHref(card.action.href)).map(card=>[card.id,card])).values()].slice(0,10);
    const uniqueActions=[...new Map(actions.filter(action=>isMaxAiActionHref(action.href)).map(action=>[action.href,action])).values()].slice(0,5);
    let safe=finalizeMaxAiNarrative(reply,uniqueCards,uniqueActions,input.message);
    if(enquiryDraft){const review=`Review your ${enquiryServiceLabels[enquiryDraft.service].toLowerCase()} enquiry below. Add your contact details in the form and choose Submit enquiry when ready. Nothing has been submitted yet.`;safe=uniqueCards.length?`${safe}\n\n${review}`:[review,...maxAiClarificationQuestions(reply,input.message)].join('\n\n');}
    messages.push({role:'assistant',content:safe});
    return {reply:safe,cards:uniqueCards,actions:uniqueActions,history:messages,...(enquiryDraft?{enquiryDraft}:{}),...(notice?{notice}:{}),metrics:{modelCalls,toolCalls:toolCount,providerMs:Math.round(providerMs),toolMs:Math.round(toolMs),durationMs:Math.round(performance.now()-started),fastPath}};
  };
  const fast=maxAiFastPath(input.message,input.history.length>0);
  if(fast&&'reply' in fast){fastPath='qualification';return finalize(fast.reply);}
  if(fast&&'tool' in fast&&allowed.has(fast.tool)){
    signal.throwIfAborted();toolCount++;
    const call={id:'app_my_trips',type:'function' as const,function:{name:fast.tool,arguments:'{}'}};
    messages.push({role:'assistant',content:null,tool_calls:[call]});
    const at=performance.now(),result=await options.runner.run(fast.tool,{});toolMs+=performance.now()-at;
    cards.push(...result.cards);actions.push(...result.actions);
    messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result.model)});
    fastPath='owned_trips';
    return finalize(terminalReply(fast.tool,result)??'Use the booking or account options below to continue. I could not verify your booking status in this reply.');
  }
  // Clear first-turn flight requests skip both model round trips (airport lookup
  // and search planning). Results come from the same validated tool and cache.
  const intent=allowed.has('search_flights')?maxAiFlightIntent(input.message,input.history.length>0,options.today??indiaToday()):null;
  if(intent){
    signal.throwIfAborted();toolCount++;
    const call={id:'app_flight_search',type:'function' as const,function:{name:'search_flights',arguments:JSON.stringify(intent)}};
    messages.push({role:'assistant',content:null,tool_calls:[call]});
    const at=performance.now(),result=await options.runner.run('search_flights',intent);toolMs+=performance.now()-at;
    cards.push(...result.cards);actions.push(...result.actions);
    const evidence=JSON.stringify(result.model);
    messages.push({role:'tool',tool_call_id:call.id,content:Buffer.byteLength(evidence,'utf8')<=4000?evidence:JSON.stringify({status:'Results are shown in the app cards. Detailed tool output was too large to summarize.'})});
    const reply=terminalReply('search_flights',result);
    if(reply){fastPath='flight_intent';return finalize(reply);}
    // Not a terminal result (e.g. needs input): let the model continue from here.
  }
  for(let round=0;round<4;round++){
    signal.throwIfAborted();
    let answer:MaxAiAssistantMessage;
    const providerStarted=performance.now();modelCalls++;
    try{answer=await complete([system,...messages],options.definitions,{signal});}
    catch(error){
      providerMs+=performance.now()-providerStarted;
      if(!(error instanceof MaxAiProviderError)||(!cards.length&&!actions.length&&!enquiryDraft))throw error;
      notice='Your app results loaded, but the AI summary is temporarily unavailable.';
      return finalize('Use the options below to continue. Prices and availability will be checked again before payment.');
    }
    providerMs+=performance.now()-providerStarted;
    const calls=answer.tool_calls??[];
    if(!calls.length)return finalize(answer.content||'Tell me the journey or task you would like help with.');
    // Do not publish unverified pre-tool narration such as "your booking is done".
    messages.push({...answer,content:null});
    const completedTools:{name:string;result:MaxAiToolResult}[]=[];
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
        const toolStarted=performance.now();result=await options.runner.run(call.function.name,args);toolMs+=performance.now()-toolStarted;
      }
      cards.push(...result.cards);actions.push(...result.actions);
      if(Array.isArray(result.model.unsupportedFilters)&&result.model.unsupportedFilters.length)notice='For complete itineraries, stop and duration preferences cannot be verified across all journeys. Inspect each flight before choosing a fare.';
      if(result.enquiryDraft){const checked=enquiryDraftSchema.safeParse(result.enquiryDraft);if(checked.success)enquiryDraft=checked.data;}
      completedTools.push({name:call.function.name,result});
      const evidence=JSON.stringify(result.model);
      messages.push({role:'tool',tool_call_id:call.id,content:Buffer.byteLength(evidence,'utf8')<=4000?evidence:JSON.stringify({status:'Results are shown in the app cards. Detailed tool output was too large to summarize.'})});
    }
    // These tools already return complete app-authored results. A second model
    // request would only paraphrase them and delay the useful cards/form.
    const preparedInRound=completedTools.some(({name,result})=>name==='prepare_enquiry'&&result.model.status==='draft_ready'&&enquiryDraftSchema.safeParse(result.enquiryDraft).success);
    const terminalReplies=completedTools.map(({name,result})=>terminalReply(name,result,preparedInRound)).filter((reply):reply is string=>reply!==null);
    if(terminalReplies.length===calls.length){fastPath='terminal_tools';return finalize([...new Set(terminalReplies)].join('\n\n'));}
    if(toolCount>=6)break;
  }
  if(!cards.length&&!actions.length&&!enquiryDraft)actions.push(...fallbackActions);
  return finalize(cards.length?'Here are the available options from the app. Open one to compare the current prices and conditions.':'I need one more step to finish this search. Tell me any missing dates, airports or guest details, or use the search buttons below.');
}

function terminalReply(name:string,result:MaxAiToolResult,preparedEnquiry=false):string|null{
  if(name==='prepare_enquiry'&&result.model.status==='draft_ready'&&enquiryDraftSchema.safeParse(result.enquiryDraft).success)return 'Review your enquiry below. Nothing has been submitted.';
  if(name==='my_trips'){
    if(result.model.status==='sign_in_required')return 'Sign in securely to view your own bookings. Enter verification codes only on the account page.';
    if(result.model.status==='access_required')return 'Your current account needs verification or permission to view bookings. Use the account option below.';
    if(result.model.status==='ok')return result.cards.length?'Your booking records are shown below.':'No bookings were found for your current account. Open My trips for the latest list, or contact support if you used a different account.';
  }
  if(result.model.status!=='ok')return null;
  // The catalogue may be the first step of a custom enquiry, and an empty
  // hotel page is not a complete search when the destination has more pages.
  if(name==='find_packages'&&!preparedEnquiry)return null;
  if(name==='search_hotels'&&!result.cards.length&&result.model.moreDestinationPages===true)return null;
  if(['search_flights','search_hotels','find_packages'].includes(name))return result.cards.length?'Here are your checked options.':name==='find_packages'?'No matching published package was found. Tell me your destination, dates and travellers to prepare a custom holiday enquiry.':'No matching options were found in the checked results. Adjust your dates or preferences, or use the search options below.';
  if(name==='navigate_task'&&result.actions.length)return `Choose “${result.actions[0].label}” below to continue.`;
  return null;
}

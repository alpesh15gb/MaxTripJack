// Run inside the app container. Synthetic capability probes only: no customer
// data, supplier searches, bookings, payments or credential values are printed.
const env=process.env;
const key=env.MAX_AI_API_KEY?.trim(),model=env.MAX_AI_MODEL?.trim()||'apexv1';
let base;
try{const url=new URL(env.MAX_AI_BASE_URL||'');if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();base=url.toString().replace(/\/+$/,'');}catch{}
console.log('Configuration',{enabled:env.MAX_AI_ENABLED==='true',gatewayConfigured:Boolean(base),apiKeyConfigured:Boolean(key),model,conversationSecretConfigured:(env.MAX_AI_CONVERSATION_SECRET?.trim()||env.BETTER_AUTH_SECRET?.trim()||'').length>=32});
if(!base||!key||/[\r\n\0]/.test(key)){process.exitCode=1;}else{
  async function call(path,body){
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok){await response.body?.cancel();return {http:response.status};}
    const reader=response.body?.getReader();if(!reader)return {http:response.status};
    let bytes=0;const chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>96000){await reader.cancel();return {http:response.status,oversized:true};}chunks.push(value);}}finally{reader.releaseLock();}
    try{return {http:response.status,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};}catch{return {http:response.status,invalidJSON:true};}
  }
  try{
    const models=await call('/models');
    console.log('Model discovery',{http:models.http,apexModelListed:Array.isArray(models.data?.data)?models.data.data.some(item=>item?.id===model):null});
    const tool={type:'function',function:{name:'search_flights',description:'Synthetic diagnostic only. Return the exact requested route, date and adults; no actual search will be executed.',parameters:{type:'object',properties:{from:{type:'string'},to:{type:'string'},date:{type:'string'},adults:{type:'integer'}},required:['from','to','date','adults'],additionalProperties:false}}};
    const date=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    const first=await call('/chat/completions',{model,stream:false,max_tokens:300,messages:[{role:'system',content:'You are Max AI. Use the provided search_flights tool for complete flight criteria; never invent availability.'},{role:'user',content:`Find BOM to DEL on ${date} for 1 adult.`}],tools:[tool],tool_choice:'auto'});
    const message=first.data?.choices?.[0]?.message,toolCall=message?.tool_calls?.[0];
    let args;try{args=JSON.parse(toolCall?.function?.arguments||'null');}catch{}
    const matched=toolCall?.function?.name==='search_flights'&&args?.from==='BOM'&&args?.to==='DEL'&&args?.date===date&&args?.adults===1;
    console.log('Function calling',{http:first.http,toolCalled:toolCall?.function?.name==='search_flights',argumentsMatched:matched});
    if(matched){
      const follow=await call('/chat/completions',{model,stream:false,max_tokens:200,messages:[{role:'system',content:'You are Max AI. Summarize tool data honestly. No flight was booked.'},{role:'user',content:`Find BOM to DEL on ${date} for 1 adult.`},{role:'assistant',content:null,tool_calls:[toolCall]},{role:'tool',tool_call_id:toolCall.id,content:JSON.stringify({status:'ok',results:[],notice:'Synthetic capability probe. No supplier was called and no availability is being asserted.'})}]});
      console.log('Tool result follow-up',{http:follow.http,assistantReplyPresent:typeof follow.data?.choices?.[0]?.message?.content==='string'&&follow.data.choices[0].message.content.length>0});
      if(follow.http!==200||typeof follow.data?.choices?.[0]?.message?.content!=='string'||!follow.data.choices[0].message.content.trim())process.exitCode=1;
    }else process.exitCode=1;
    const missing=await call('/chat/completions',{model,stream:false,max_tokens:200,messages:[{role:'system',content:'You are Max AI. If someone requests a flight ticket without details, ask for origin, destination and departure date. Do not search or invent a flight.'},{role:'user',content:'I want a flight ticket.'}],tools:[tool],tool_choice:'auto'});
    const reply=missing.data?.choices?.[0]?.message;
    console.log('Missing-details response',{http:missing.http,assistantReplyPresent:typeof reply?.content==='string'&&reply.content.trim().length>0,mentionsRouteAndDate:typeof reply?.content==='string'&&/origin|destination|route|from|where/i.test(reply.content)&&/date|when|day/i.test(reply.content),unexpectedToolCalls:Boolean(reply?.tool_calls?.length)});
    if(missing.http!==200||!reply?.content?.trim()||reply?.tool_calls?.length)process.exitCode=1;
  }catch(error){console.log('Diagnostic unavailable',{type:error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'aborted':'connection_or_response'});process.exitCode=1;}
}

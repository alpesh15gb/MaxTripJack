import test from 'node:test';
import assert from 'node:assert/strict';
import {maxAiModelScope} from '../src/lib/max-ai-model-scope';
import type {MaxAiMessage} from '../src/lib/max-ai-conversation';
import type {MaxAiFunction} from '../src/lib/max-ai-provider';

const names=['lookup_airports','search_flights','lookup_destinations','lookup_nationalities','search_hotels','find_packages','prepare_enquiry','my_trips','travel_help','company_info','navigate_task'];
const definitions:MaxAiFunction[]=names.map(name=>({type:'function',function:{name,description:name,parameters:{type:'object'}}}));
const messages=(...input:string[]):MaxAiMessage[]=>input.flatMap(content=>[{role:'user' as const,content},{role:'assistant' as const,content:'How can I help?'}]);
const tools=(...input:string[])=>maxAiModelScope(messages(...input),definitions).definitions.map(tool=>tool.function.name);

test('simple travel explanations omit supplier tools, while current and personal questions keep them',()=>{
  assert.deepEqual(tools('What is a layover?'),[]);
  assert.deepEqual(tools('How does online check-in work?'),[]);
  assert.ok(tools('What is my booking status?').includes('my_trips'));
  assert.ok(tools('What is the current flight fare?').includes('search_flights'));
});

test('flight and hotel requests carry only relevant lookup and search tools',()=>{
  const flight=tools('Find a flight from Mumbai to Delhi next week');
  assert.ok(flight.includes('lookup_airports')&&flight.includes('search_flights'));
  assert.ok(!flight.includes('search_hotels')&&!flight.includes('prepare_enquiry'));
  const hotel=tools('Find a hotel in Goa next month');
  assert.ok(hotel.includes('lookup_destinations')&&hotel.includes('lookup_nationalities')&&hotel.includes('search_hotels'));
  assert.ok(!hotel.includes('search_flights'));
  assert.ok(tools('Find hotels in Goa').includes('search_hotels'));
  assert.ok(!tools('Find hotels in Goa').includes('search_flights'));
  const mixed=tools('Find a flight and hotel in Goa');
  assert.ok(mixed.includes('search_flights')&&mixed.includes('search_hotels'));
  assert.deepEqual(tools('Help with the details we discussed'),names);
});

test('follow-ups retain tools from the customer context, including own booking lookup',()=>{
  assert.ok(tools('Find a flight to Delhi','Can you show a later one?').includes('search_flights'));
  assert.ok(tools('Show the status of my ticket').includes('my_trips'));
});

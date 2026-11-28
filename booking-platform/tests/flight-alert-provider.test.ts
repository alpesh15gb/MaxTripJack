import assert from 'node:assert/strict';
import * as moduleApi from 'node:module';
import {resolve} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

type Resolve = (specifier:string,context:{parentURL?:string},next:(specifier:string,context:{parentURL?:string})=>{url:string})=>{url:string;shortCircuit?:boolean};
const registerHooks = (moduleApi as unknown as {registerHooks:(hooks:{resolve:Resolve})=>{deregister:()=>void}}).registerHooks;
const hook = registerHooks({resolve(specifier,context,next) {
  if (specifier==='server-only') return {url:pathToFileURL(resolve('node_modules/server-only/empty.js')).href,shortCircuit:true};
  return next(specifier,context);
}});
const provider = import('../src/lib/flight-alert-provider').finally(()=>hook.deregister());

const endpoint = 'https://fixture-air.tripjack.com/fms/v1/air-search-all';
const env = {FLIGHT_PRICE_ALERTS_ENABLED:'true',TRIPJACK_PRICE_ALERT_SEARCH_URL:endpoint,TRIPJACK_PRICE_ALERT_API_KEY:'synthetic-only'};

test('price-alert supplier config requires a separately approved production Search URL and key',async()=>{
  const {flightAlertProviderConfig} = await provider;
  assert.deepEqual(flightAlertProviderConfig(env),{endpoint,key:'synthetic-only'});
  assert.equal(flightAlertProviderConfig({...env,FLIGHT_PRICE_ALERTS_ENABLED:'false'}),null);
  assert.equal(flightAlertProviderConfig({...env,TRIPJACK_FLIGHT_API_KEY:'synthetic-only'}),null);
  for (const url of [
    'https://apitest.tripjack.com/fms/v1/air-search-all',
    'https://uat-air.tripjack.com/fms/v1/air-search-all',
    'https://flight.tripjack.com.example.test/fms/v1/air-search-all',
    'https://fixture-air.tripjack.com/oms/v1/air/book',
    'https://fixture-air.tripjack.com:1234/fms/v1/air-search-all',
    'https://fixture-air.tripjack.com/fms/v1/air-search-all?extra=yes',
    'http://fixture-air.tripjack.com/fms/v1/air-search-all',
  ]) assert.equal(flightAlertProviderConfig({...env,TRIPJACK_PRICE_ALERT_SEARCH_URL:url}),null);
});

test('one-adult flight alert projects only matching public fares with the customer price rule',async ()=>{
  const {flightAlertProviderConfig,observeProductionAlertFare} = await provider;
  const route = {from:'BOM',to:'DEL',date:'2026-12-20',cabin:'ECONOMY'} as const;
  const fare = (id:string,TF:number,fareIdentifier='STANDARD',cc='ECONOMY')=>({id,fareIdentifier,fD:{ADULT:{cc,fC:{TF}}}});
  const reply = {status:{success:true},searchResult:{tripInfos:{ONWARD:[
    {sI:[{da:{code:route.from},aa:{code:route.to},dt:route.date+'T11:00:00'}],
      totalPriceList:[fare('public',2000),fare('corporate',500,'CORPORATE'),fare('wrong-cabin',600,'STANDARD','FIRST')]},
    {sI:[{da:{code:route.from},aa:{code:'JAI'},dt:route.date+'T11:00:00'}],totalPriceList:[fare('wrong-airport',100)]},
  ]}}};
  const request:typeof fetch = async (url,init)=>{
    assert.equal(url,endpoint);
    assert.equal(init?.method,'POST');
    assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).get('apikey'),'synthetic-only');
    assert.deepEqual(JSON.parse(String(init?.body)),{searchQuery:{
      cabinClass:'ECONOMY',paxInfo:{ADULT:1,CHILD:0,INFANT:0},
      routeInfos:[{fromCityOrAirport:{code:'BOM'},toCityOrAirport:{code:'DEL'},travelDate:route.date}],
    }});
    return Response.json(reply);
  };
  assert.equal(await observeProductionAlertFare(route,flightAlertProviderConfig(env)!,
    {markup_minor:100,markup_basis_points:0,service_fee_minor:200},request),200300);
  await assert.rejects(()=>observeProductionAlertFare(route,flightAlertProviderConfig(env)!,undefined,
    async()=>Response.json({status:{success:true}})),/incomplete/);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {exactAirportGroups} from '../src/lib/flight-airport-scope';
import {orderedFlightSelection} from '../src/lib/flight-selection';
const criteria={from:'BOM',to:'DEL',date:'2026-10-29'};
const segment=(from:string,to:string,date='2026-10-29')=>({da:{code:from},aa:{code:to},dt:date+'T11:25'});
const trip=(id:string,...sI:ReturnType<typeof segment>[])=>({sI,totalPriceList:[{id}]});
test('exact BOM DEL excludes NMI departures and DXN arrivals without relabeling or losing connections',()=>{
 const exact=trip('exact',segment('BOM','DEL')),connection=trip('connection',segment('BOM','IXB'),segment('IXB','DEL'));
 const groups={ONWARD:[trip('alternate-departure',segment('NMI','DEL')),trip('alternate-arrival',segment('BOM','DXN')),exact,connection]};
 const filtered=exactAirportGroups(groups,criteria);assert.deepEqual(filtered.ONWARD,[exact,connection]);assert.equal(filtered.ONWARD[0],exact);
 assert.deepEqual(orderedFlightSelection(filtered,['connection'],{...criteria,returnDate:undefined}),['connection']);
 for(const id of ['alternate-departure','alternate-arrival'])assert.throws(()=>orderedFlightSelection(filtered,[id],{...criteria,returnDate:undefined}),/current search/);
 assert.equal(groups.ONWARD[0].sI[0].da.code,'NMI');assert.equal(groups.ONWARD[1].sI[0].aa.code,'DXN');
});
test('roundtrip and numeric multicity groups match each requested leg and date',()=>{
 const back=trip('back',segment('DEL','HYD','2026-11-02'),segment('HYD','BOM','2026-11-02'));
 const result=exactAirportGroups({ONWARD:[trip('out',segment('BOM','DEL'))],RETURN:[back,trip('wrong',segment('DXN','BOM','2026-11-02'))]},{...criteria,returnDate:'2026-11-02'});
 assert.deepEqual(result.RETURN,[back]);assert.deepEqual(orderedFlightSelection(result,['back','out'],{...criteria,returnDate:'2026-11-02'}),['out','back']);
 const legs=[criteria,{from:'DEL',to:'GOI',date:'2026-11-02'}];
 const final=trip('second',segment('DEL','GOI','2026-11-02'));
 assert.deepEqual(exactAirportGroups({'0':[trip('first',segment('BOM','DEL'))],'1':[final,trip('bad',segment('DXN','GOI','2026-11-02'))]},{...criteria,legs})['1'],[final]);
});
test('COMBO checks every boundary, preserves connected legs, rejects missing legs and interior alternate airports',()=>{
 const good=trip('combo',segment('BOM','IXB'),segment('IXB','DEL'),segment('DEL','HYD','2026-11-02'),segment('HYD','BOM','2026-11-02'));
 const bad=trip('bad',segment('BOM','DXN'),segment('DXN','BOM','2026-11-02'));
 assert.deepEqual(exactAirportGroups({COMBO:[good,bad,trip('incomplete',segment('BOM','DEL'))]},{...criteria,returnDate:'2026-11-02'}).COMBO,[good]);
 const legs=[criteria,{from:'DEL',to:'GOI',date:'2026-11-02'},{from:'GOI',to:'BOM',date:'2026-11-04'}];
 const multi=trip('multi',segment('BOM','IXB'),segment('IXB','DEL'),segment('DEL','GOI','2026-11-02'),segment('GOI','BOM','2026-11-04'));
 const grouped=exactAirportGroups({COMBO:[multi]},{...criteria,legs});assert.deepEqual(grouped.COMBO,[multi]);assert.deepEqual(orderedFlightSelection(grouped,['multi'],{legs}),['multi']);
 const separated=exactAirportGroups({'0':[trip('a',segment('BOM','DEL'))],'1':[trip('b',segment('DEL','GOI','2026-11-02'))],'2':[trip('c',segment('GOI','BOM','2026-11-04'))]},{...criteria,legs});assert.deepEqual(orderedFlightSelection(separated,['c','b','a'],{legs}),['a','b','c']);
});
test('malformed airports, unknown groups, wrong date and empty segments fail closed',()=>{
 assert.deepEqual(exactAirportGroups({ONWARD:[null,{},trip('empty'),trip('date',segment('BOM','DEL','2026-10-30')),trip('lower',segment('bom','DEL'))],UNKNOWN:[trip('unknown',segment('BOM','DEL'))]},criteria),{ONWARD:[],UNKNOWN:[]});
});

test('no partial return or multi-city journey is selectable when an exact leg is missing',()=>{
 const outbound=trip('out',segment('BOM','DEL'));
 const groups={ONWARD:[outbound],RETURN:[trip('alternate-return',segment('DXN','BOM','2026-11-02'))]};
 const filtered=exactAirportGroups(groups,{...criteria,returnDate:'2026-11-02'});
 assert.deepEqual(filtered,{ONWARD:[],RETURN:[]});assert.equal(groups.ONWARD[0],outbound);
 assert.throws(()=>orderedFlightSelection(filtered,['out'],{returnDate:'2026-11-02'}),/current search/);
 const legs=[criteria,{from:'DEL',to:'GOI',date:'2026-11-02'}];
 assert.deepEqual(exactAirportGroups({'0':[outbound],'1':[]},{...criteria,legs}),{'0':[],'1':[]});
 assert.deepEqual(exactAirportGroups({'0':[outbound]},{...criteria,legs}),{'0':[]});
 const combo=trip('complete',segment('BOM','DEL'),segment('DEL','GOI','2026-11-02'));
 assert.deepEqual(exactAirportGroups({COMBO:[combo],'0':[outbound],'1':[]},{...criteria,legs}).COMBO,[combo]);
});

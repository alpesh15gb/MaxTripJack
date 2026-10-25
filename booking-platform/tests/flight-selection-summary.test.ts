import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedJourneyEstimate, type FlightSelectionGroup } from '../src/lib/flight-selection-summary';
import { airportDecisionLabel as selectionAirportLabel } from '../src/lib/flight-decision';

function choice(group: string, price: number | null = 654000, currency?: string): FlightSelectionGroup {
  const fare = { id: `fare-${group}`, fareIdentifier: 'STANDARD', customerEstimateMinor: price, ...(currency === undefined ? {} : { currency }), fD: {} };
  return { group, fare, flight: { sI: [{ dt: '2027-01-01T09:00:00', at: '2027-01-01T11:00:00', duration: 120, da: { code: 'BOM' }, aa: { code: 'DEL' }, fD: { aI: { name: 'Synthetic' }, fN: '101' } }], totalPriceList: [fare] } };
}

test('complete selected INR party estimates sum once without mutating choices', () => {
  const groups = [choice('ONWARD'), choice('RETURN', 700000, 'INR')];
  const before = JSON.stringify(groups);
  assert.equal(selectedJourneyEstimate(groups), 1354000);
  assert.equal(JSON.stringify(groups), before);
  assert.equal(selectedJourneyEstimate([choice('ONWARD')]), 654000);
});
test('missing selections, empty groups or absent flight membership cannot claim a complete total', () => {
  assert.equal(selectedJourneyEstimate([]), null);
  assert.equal(selectedJourneyEstimate([choice('ONWARD'), { group: 'RETURN' }]), null);
  const orphan = choice('ONWARD'); orphan.flight!.totalPriceList = [];
  assert.equal(selectedJourneyEstimate([orphan]), null);
  const empty = choice('ONWARD'); empty.flight!.sI = [];
  assert.equal(selectedJourneyEstimate([empty]), null);
});
test('mixed or explicitly unknown currency and invalid estimates stay unknown', () => {
  for (const currency of ['USD', '', 'inr']) assert.equal(selectedJourneyEstimate([choice('ONWARD'), choice('RETURN', 12300, currency)]), null);
  for (const price of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(selectedJourneyEstimate([choice('ONWARD', price)]), null);
  const absent = choice('ONWARD'); delete absent.fare!.customerEstimateMinor;
  assert.equal(selectedJourneyEstimate([absent]), null);
});
test('safe integer overflow and repeated group or fare ids cannot double-count', () => {
  assert.equal(selectedJourneyEstimate([choice('ONWARD', Number.MAX_SAFE_INTEGER), choice('RETURN', 1)]), null);
  assert.equal(selectedJourneyEstimate([choice('ONWARD'), choice('ONWARD')]), null);
  const second = choice('RETURN'); second.fare!.id = 'fare-ONWARD';
  assert.equal(selectedJourneyEstimate([choice('ONWARD'), second]), null);
});
test('COMBO is counted once for all segments and never added to individual leg prices', () => {
  const combo = choice('COMBO', 1234000);
  combo.flight!.sI.push({ ...combo.flight!.sI[0], dt: '2027-01-05T12:00:00', at: '2027-01-05T14:00:00', da: { code: 'DEL' }, aa: { code: 'BOM' } });
  assert.equal(selectedJourneyEstimate([combo]), 1234000);
  assert.equal(selectedJourneyEstimate([combo, choice('RETURN')]), null);
});
test('airport labels use only supplied names with code/city fallback', () => {
  assert.equal(selectionAirportLabel({ code: 'BOM', city: 'Mumbai', name: 'Supplied airport name' }), 'BOM · Supplied airport name · Mumbai');
  assert.equal(selectionAirportLabel({ code: 'BOM', city: 'Mumbai' }), 'BOM · Mumbai');
  assert.equal(selectionAirportLabel(undefined), 'Airport not supplied');
  assert.equal(selectionAirportLabel({ code: 'BOM', city: 'BOM', name: '' }), 'BOM');
});

test('selected summary renders exact local dates, known duration, day change and an explicit review action', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: FlightSelectionSummary } = await import('../src/components/flight-selection-summary');
  const outbound = choice('ONWARD');
  outbound.flight!.sI[0].dt = '2027-01-01T23:30:00';
  outbound.flight!.sI[0].at = '2027-01-02T01:30:00';
  const html = renderToStaticMarkup(createElement(FlightSelectionSummary, { groups: [outbound, choice('RETURN')], activeGroup: 'RETURN', busy: false, checking: false, allSelected: true, onChange: () => {}, onReview: () => {} }));
  assert.match(html, /Departs 1 Jan 2027 · 23:30/);
  assert.match(html, /Arrives 2 Jan 2027 · 01:30/);
  assert.match(html, /\+1 calendar day/);
  assert.match(html, /2h 0m · Non-stop/);
  assert.match(html, /₹13,080.00 estimated total/);
  assert.match(html, /Change outbound/); assert.match(html, /Change return/);
  assert.match(html, /id="review-selected-journey"/); assert.match(html, /Review selected journey \(2\/2\)/);
  assert.match(html, /aria-label="Selected flight context"/);
});
test('COMBO summary shows segments without calling separate journeys stops or inventing total duration', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: FlightSelectionSummary } = await import('../src/components/flight-selection-summary');
  const combo = choice('COMBO');
  combo.flight!.sI.push({ ...combo.flight!.sI[0], dt: '2027-01-05T12:00:00', at: '2027-01-05T14:00:00', da: { code: 'DEL' }, aa: { code: 'BOM' } });
  const html = renderToStaticMarkup(createElement(FlightSelectionSummary, { groups: [combo], activeGroup: 'COMBO', busy: true, checking: true, allSelected: true, onChange: () => {}, onReview: () => {} }));
  assert.match(html, /1 Jan 2027/); assert.match(html, /5 Jan 2027/);
  assert.match(html, /Total itinerary duration not supplied/);
  assert.doesNotMatch(html, /1 stop|Non-stop/);
  assert.match(html, /role="status"/); assert.match(html, /disabled=""/);
});
test('incomplete summary retains next-leg context without review action or pretend combined price', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: FlightSelectionSummary } = await import('../src/components/flight-selection-summary');
  const html = renderToStaticMarkup(createElement(FlightSelectionSummary, { groups: [choice('ONWARD'), { group: 'RETURN' }], activeGroup: 'RETURN', busy: false, checking: false, allSelected: false, onChange: () => {}, onReview: () => {} }));
  assert.match(html, /Choose this flight next/);
  assert.match(html, /Complete total checked at review/);
  assert.doesNotMatch(html, /id="review-selected-journey"|₹13,080/);
});

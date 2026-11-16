import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeMaxAiNarrative} from '../src/lib/max-ai-narrative';
import type {MaxAiCard} from '../src/lib/max-ai-contract';

const card = (type: MaxAiCard['type']): MaxAiCard => ({id: type, type, title: 'Supplier title', subtitle: '', details: [], action: {label: 'Open', href: type === 'trip' ? '/my-trips' : '/book'}});
const finish = (text: string, message = 'Find me a trip') => finalizeMaxAiNarrative(text, [], [], message);

test('server result types determine summaries without repeating model claims or private card details', () => {
  const cards = [card('flight'), card('hotel'), card('package'), card('trip')];
  cards[3].title = 'Private traveller name';
  const result = finalizeMaxAiNarrative('I booked your trip for ₹1. Your hotel is refundable. Payment successful!', cards, [], 'Book it');
  assert.match(result, /flight options returned by the app/);
  assert.match(result, /price basis/);
  assert.match(result, /choose a room/);
  assert.match(result, /Prices are indicative/);
  assert.match(result, /Open a trip to check/);
  assert.doesNotMatch(result, /₹1|refundable|successful|Private traveller/);
  assert.equal(result, finalizeMaxAiNarrative('Different invented price and policy', cards, [], 'Other request'));
});

test('blocks direct and implied successful mutations without authenticated status evidence', () => {
  for (const text of [
    'I have booked your flight.', 'We successfully refunded your payment.', 'I updated your booking.',
    'Your booking is confirmed.', 'Payment successful.', 'Your refund has been processed.',
    'Your ticket was issued.', 'Booking cancelled.', 'Your reservation is now confirmed.',
    'Successfully changed your flight.', 'Your booking is not confirmed, but payment succeeded.',
    'Your booking is confirmed. Would you like anything else?',
    'Please note that your booking is confirmed.',
  ]) {
    const result = finish(text);
    assert.notEqual(result, text, text);
    assert.match(result, /Complete bookings, payments and changes/);
  }
  assert.match(finalizeMaxAiNarrative('Your booking is confirmed.', [], [{label: 'My trips', href: '/my-trips'}], 'Status?'), /^Open My trips/);
});

test('preserves questions, requests, negation and explanations that do not assert completion', () => {
  for (const text of [
    'Is your booking confirmed?', 'Has your payment been received?', 'Please confirm the booking in checkout.',
    'If your booking is confirmed, open My trips for the voucher.', 'Your booking is not confirmed.',
    "I haven't booked your flight.", 'Payment received does not mean booking confirmed.',
    'A payment receipt does not guarantee your booking is confirmed.',
    'You can cancel a booking from My trips after reviewing the cancellation charges.',
  ]) assert.equal(finish(text), text);
});

test('blocks ungrounded monetary quotes including matching a user budget to an invented fare', () => {
  for (const text of [
    'Your fare is ₹5,000.', 'Rooms start at INR 2500.', 'The stay costs 4000 rupees.',
    'The flight is available for Rs. 3000.', 'The package costs $300.',
    'I found flights under your ₹10,000 budget.', 'Your flight costs ₹10,000.',
  ]) assert.match(finish(text, 'My budget is ₹10,000'), /do not have a verified fare or room rate/, text);
});

test('preserves the visitor budget while blocking invented amounts or real quotes disguised as budgets', () => {
  for (const text of ['Your budget is ₹10,000.', "I'll keep your budget under INR 10000.", 'You can spend up to 10000 rupees.']) {
    assert.equal(finish(text, 'My budget is 10000'), text);
  }
  assert.match(finish('Your budget is ₹20,000.', 'My budget is 10000'), /do not have a verified fare/);
  assert.match(finish('The available fare within your budget is ₹10,000.', 'My budget is 10000'), /do not have a verified fare/);
  assert.equal(finish('What dates and departure city do you prefer?'), 'What dates and departure city do you prefer?');
  assert.equal(finish('  '), 'Tell me the journey or task you would like help with.');
  assert.equal(finish('a'.repeat(5000)).length, 4000);
});

test('completed navigation claims become truthful action instructions without pretending to open a page', () => {
  const actions = [{label: 'Open My trips', href: '/my-trips'}];
  for (const value of [
    'I have opened the My Trips section for you.', 'I\'ve just opened My Trips.',
    'We redirected you to your account.', 'I have taken you to My Trips.',
    'You have been redirected to the booking page.', 'The account page is now open.',
    'Opened My Trips for you.',
  ]) {
    assert.equal(finalizeMaxAiNarrative(value, [], actions, 'Show my bookings'), 'Choose “Open My trips” below to continue.', value);
  }
  assert.match(finish('I have opened My Trips.'), /provide the right navigation option/);
  assert.doesNotMatch(finish('I have opened My Trips.'), /below|already open/i);
  assert.equal(finalizeMaxAiNarrative('I opened your account.', [], [...actions, {label: 'Open account', href: '/account'}], 'Help'), 'Choose one of the options below to continue.');
});

test('navigation safeguard preserves real guidance, payment boundaries and requests', () => {
  const actions = [{label: 'Open My trips', href: '/my-trips'}];
  const guidance = 'Payment received does not mean booking confirmed. Open a trip to check the separate payment, booking and refund updates.';
  assert.equal(finalizeMaxAiNarrative(guidance, [], actions, 'My payment was captured'), guidance);
  assert.equal(finalizeMaxAiNarrative(guidance + ' I have opened My Trips.', [], actions, 'My payment was captured'), guidance + '\n\nChoose “Open My trips” below to continue.');
  for (const value of ['Please open My Trips.', 'Have you opened My Trips?', "I haven't opened a page.", 'If the page is open, check the booking status.', 'Choose Open My trips below to continue.']) {
    assert.equal(finalizeMaxAiNarrative(value, [], actions, 'Help'), value);
  }
  assert.match(finalizeMaxAiNarrative('I opened your trips.', [card('trip')], actions, 'Show bookings'), /Your booking records are shown below/);
});

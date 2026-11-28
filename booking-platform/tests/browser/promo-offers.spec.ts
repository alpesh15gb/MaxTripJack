import {continueToTravellerDetails,  test, expect, capture, expectNoHorizontalOverflow, openFlightSearch, quoteId } from './fixtures';
import type { Page } from '@playwright/test';

async function reviewedCheckout(page: Page) {
  await openFlightSearch(page);
  await page.locator('.fare-comparison-trigger').first().click();
  await page.getByRole('button', {name: 'Check fare & continue', exact: true}).first().click();
  await continueToTravellerDetails(page);
  const form = page.getByRole('form', {name: 'Review and travellers'});
  await form.getByLabel('First name', {exact: true}).fill('Aarav');
  await form.getByLabel('Last name', {exact: true}).fill('Example');
  await form.getByLabel('Email', {exact: true}).fill('traveller@example.test');
  await form.getByLabel('Mobile number', {exact: true}).fill('9876543210');
  return form;
}

test('checkout discovers public offers on demand and uses the existing apply path', async ({page, provider}, info) => {
  provider.overrides['GET /api/travel/promo'] = {body: {offers: [
    {code: 'FLY75', discountMinor: 7500, minimumMinor: 500000, expiresAt: '2030-01-01T00:00:00.000Z'},
  ]}};
  provider.overrides['POST /api/travel/promo'] = {body: {quoteId, totalMinor: 646500, discountMinor: 7500, originalTotalMinor: 654000, code: 'FLY75'}};
  await reviewedCheckout(page);
  const promo = page.locator('#booking-summary').getByRole('region', {name: 'Promo code', exact: true});
  await expect(promo).toBeVisible();
  await expect(promo.getByRole('button', {name: 'Remove code', exact: true})).toHaveCount(0);
  const alignment = await promo.locator('.checkout-promo-entry').evaluate(node => {
    const input = node.querySelector('input')!.getBoundingClientRect();
    const apply = node.querySelector('button')!.getBoundingClientRect();
    return {gap: apply.left - input.right, centerOffset: Math.abs((apply.top + apply.height / 2) - (input.top + input.height / 2))};
  });
  expect(alignment.gap).toBeGreaterThanOrEqual(0);
  expect(alignment.centerOffset).toBeLessThanOrEqual(3);
  expect(provider.requests('/api/travel/promo')).toHaveLength(0);
  await promo.getByRole('button', {name: 'Available offers', exact: true}).click();
  await expect(promo).toContainText('FLY75 · Save ₹75');
  await expect(promo).toContainText('Minimum booking ₹5,000');
  const offer = promo.getByRole('button', {name: 'Apply FLY75', exact: true});
  await expect(offer).toBeEnabled();
  expect(provider.requests('/api/travel/promo').map(request => request.method)).toEqual(['GET']);
  await expectNoHorizontalOverflow(page);
  await capture(page, info, 'checkout-public-offers');
  await offer.click();
  await expect(promo.getByRole('status')).toContainText('FLY75 applied. You save ₹75.');
  await expect(promo.getByLabel('Promo code', {exact: true})).toHaveValue('FLY75');
  await expect(promo.getByRole('button', {name: 'Remove code', exact: true})).toBeVisible();
  await expect(page.locator('#booking-summary').getByRole('button', {name: /^Agree & pay /})).toContainText('₹6,465');
  expect(provider.requests('/api/travel/promo').find(request => request.method === 'POST')?.body).toEqual({quoteId, code: 'FLY75'});
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('an invalid offers response leaves manual entry and the confirmed total available', async ({page, provider}) => {
  provider.overrides['GET /api/travel/promo'] = {body: {offers: [
    {code: 'FLY75', discountMinor: 7500, minimumMinor: 500000, expiresAt: 'invalid date'},
  ]}};
  await reviewedCheckout(page);
  const promo = page.locator('#booking-summary').getByRole('region', {name: 'Promo code', exact: true});
  await promo.getByRole('button', {name: 'Available offers', exact: true}).click();
  await expect(promo.getByRole('status')).toContainText('Available offers could not be loaded.');
  await expect(promo.getByRole('button', {name: 'Apply FLY75', exact: true})).toHaveCount(0);
  await promo.getByLabel('Promo code', {exact: true}).fill('PRIVATE75');
  await expect(promo.getByRole('button', {name: 'Apply code', exact: true})).toBeEnabled();
  await expect(page.locator('#booking-summary').getByRole('button', {name: /^Agree & pay /})).toBeEnabled();
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('a promo is private until an administrator opts into checkout discovery', async ({page, provider}) => {
  provider.overrides['GET /api/admin/promo-codes'] = {body: {rows: []}};
  provider.overrides['POST /api/admin/promo-codes'] = {body: {id: '11111111-1111-4111-8111-111111111111', version: 1}};
  await page.goto('/operations/promos');
  const create = page.getByRole('button', {name: 'Create promo code', exact: true});
  for (const discoverable of [false, true]) {
    await create.click();
    const visibility = page.getByRole('checkbox', {name: 'Show in checkout offers', exact: true});
    await expect(visibility).not.toBeChecked();
    if (discoverable) await visibility.check();
    await page.getByLabel('Code', {exact: true}).fill(discoverable ? 'PUBLIC75' : 'PRIVATE75');
    await page.getByLabel('Discount value', {exact: true}).fill('75');
    await page.getByLabel('Expiry (your local time)', {exact: true}).fill('2030-01-01T05:30');
    await page.getByRole('button', {name: 'Save promo code', exact: true}).click();
    await expect(page.getByRole('status')).toContainText('Promo code saved.');
  }
  expect(provider.requests('/api/admin/promo-codes').filter(request => request.method === 'POST').map(request => request.body)).toEqual([
    expect.objectContaining({code: 'PRIVATE75', discoverable: false}),
    expect.objectContaining({code: 'PUBLIC75', discoverable: true}),
  ]);
});

test('payment options apply a quoted offer through the same promo action and keep payment optional', async ({page, provider}) => {
  provider.overrides['GET /api/travel/promo'] = {body:{offers:[
    {code:'FLY75',discountMinor:7500,minimumMinor:500000,expiresAt:'2030-01-01T00:00:00.000Z'},
  ]}};
  provider.overrides['POST /api/travel/promo'] = {body:{quoteId,totalMinor:646500,discountMinor:7500,originalTotalMinor:654000,code:'FLY75'}};
  const form = await reviewedCheckout(page);
  const launch = form.getByRole('button',{name:'Choose a preferred payment method'});
  await launch.click();
  const sheet = page.getByRole('dialog',{name:'Payment options'});
  await sheet.getByRole('radio',{name:'UPI',exact:true}).check();
  await sheet.getByRole('button',{name:'Back to booking review'}).click();
  await expect(launch).toBeFocused();
  await launch.click();
  await expect(sheet.getByRole('radio',{name:'UPI',exact:true})).not.toBeChecked();
  await sheet.getByRole('button',{name:/FLY75.*Apply/}).click();
  await expect(sheet).not.toBeVisible();
  await expect(form.getByRole('region',{name:'Promo code',exact:true})).toContainText('FLY75 applied.');
  await expect(form.getByRole('button',{name:/^Agree & pay /})).toContainText('₹6,465');
  expect(provider.requests('/api/travel/promo').filter(call=>call.method==='POST').map(call=>call.body)).toEqual([{quoteId,code:'FLY75'}]);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

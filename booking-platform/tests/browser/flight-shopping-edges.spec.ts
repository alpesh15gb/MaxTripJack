import {test, expect, flight, departure, returning, searchId, openFlightSearch, expectNoHorizontalOverflow} from './fixtures';
import type {Flight} from '../../src/lib/booking-presentation';

test('fare disclosure stays open while the supplier review is pending', async ({page, provider}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/travel/review', async route => { await held; await route.fallback(); });

  try {
    await openFlightSearch(page);
    const comparison = page.locator('.flight-shopping-list .fare-comparison').first();
    const disclosure = comparison.locator('summary');
    await disclosure.click();
    await comparison.getByRole('button', {name: 'Check fare & continue', exact: true}).click();
    const status = comparison.getByRole('status');
    await expect(status).toContainText('Checking current fare');
    await expect(disclosure).toHaveAttribute('aria-disabled', 'true');

    // Native summary clicks and their keyboard equivalents must both be guarded.
    await disclosure.evaluate(node => (node as HTMLElement).click());
    await disclosure.press('Space');
    await expect(comparison).toHaveAttribute('open', '');
    await expect(status).toBeVisible();
    await expect(comparison.getByRole('button', {name: 'Checking fare…', exact: true})).toBeDisabled();
  } finally {
    release();
  }

  await expect(page.getByRole('form', {name: 'Review and travellers'})).toBeVisible();
  expect(provider.requests('/api/travel/review')).toHaveLength(1);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('the incompatible fare notice fits above its expanded comparison and close action', async ({page, provider}) => {
  if (page.viewportSize()!.width > 1100) await page.setViewportSize({width: 1101, height: 900});
  const back: Flight = flight('RETURN', 'incompatible-return');
  back.totalPriceList[0] = {...back.totalPriceList[0], fareIdentifier: 'SPECIAL_RETURN', msri: ['different-outbound']};
  provider.search = {searchId, results: {searchResult: {tripInfos: {ONWARD: [flight()], RETURN: [back]}}}};
  await page.goto('/book?' + new URLSearchParams({product: 'FLIGHT', from: 'BOM', to: 'DEL', date: departure, returnDate: returning, adults: '1', autoSearch: '1'}));

  const comparison = page.locator('.flight-shopping-list .fare-comparison');
  await comparison.locator('summary').click();
  await comparison.getByRole('button', {name: 'Choose this outbound fare', exact: true}).click();
  const disclosure = comparison.locator('summary');
  await expect(disclosure).toContainText('No compatible fare');
  await disclosure.click();
  await expect(comparison.getByRole('button', {name: 'Choose this return fare', exact: true})).toBeDisabled();

  const bounds = await comparison.evaluate(node => ({
    noticeBottom: node.querySelector('summary')!.getBoundingClientRect().bottom,
    panelTop: node.querySelector('.fare-comparison-options')!.getBoundingClientRect().top,
  }));
  expect(bounds.noticeBottom).toBeLessThanOrEqual(bounds.panelTop + 1);
  await expectNoHorizontalOverflow(page);
  await comparison.getByRole('button', {name: 'Back to flights', exact: true}).click();
  await expect(disclosure).toBeFocused();
  await expect(comparison.locator('.fare-comparison-options')).toHaveCount(0);
  expect(provider.requests('/api/travel/review')).toHaveLength(0);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

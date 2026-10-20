import { test, expect, capture, expectNoHorizontalOverflow } from './fixtures';

test('route guide preserves only the airport pair and never auto-searches', async ({ page, provider }, testInfo) => {
  await page.goto('/flights/mumbai-to-goa');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mumbai to Goa flights: choose GOI or GOX before booking');
  await expect(page.getByRole('table')).toContainText('Dabolim');
  const planningLink = page.getByRole('link', { name: 'Plan this route', exact: true });
  const primary = new URL((await planningLink.getAttribute('href'))!, 'https://maxtravel.in');
  expect(Object.fromEntries(primary.searchParams)).toEqual({ product: 'FLIGHT', from: 'BOM', to: 'GOI' });
  await expect(page.locator('main a[href="/book?product=FLIGHT&from=BOM&to=GOX"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Official planning references' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'public-goa-guide');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
  await planningLink.click();
  await page.waitForURL(url => url.pathname === '/book');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ product: 'FLIGHT', from: 'BOM', to: 'GOI' });
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

test('office details are consistent and contact actions are explicit', async ({ page }, testInfo) => {
  await page.goto('/office');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Our Secunderabad office.');
  const card = page.getByRole('region', { name: 'MaxTravel office and contact details' });
  await expect(card).toContainText('G-10, Golden Hawk');
  await expect(card).toContainText('500003');
  await expect(card).toContainText('Every day, 9:00 am–9:00 pm (India time)');
  await expect(card.locator('a[href="tel:+917095018018"]')).toBeVisible();
  await expect(card.locator('a[href="mailto:max@maxtravel.us"]')).toBeVisible();
  await expect(card.locator('a[href="https://wa.me/917095018018"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'public-office');
});

test('unreviewed city permutations are real 404s rather than generated landing pages', async ({ page }) => {
  const response = await page.goto('/flights/this-route-is-not-authored');
  expect(response?.status()).toBe(404);
});

test.describe('public content without client JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('homepage identity and route guidance are server-rendered', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Flights & stays.');
    await expect(page.getByRole('heading', { name: 'Competitive travel prices. Real people. A real office.' })).toBeVisible();
    await expect(page.locator('main a[href="/flights/hyderabad-to-delhi"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
  test('airport details and source links are server-rendered', async ({ page }) => {
    await page.goto('/flights/hyderabad-to-dubai');
    await expect(page.getByRole('table')).toContainText('Dubai International');
    await expect(page.getByRole('heading', { name: 'DXB and DWC are different airports' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Official planning references' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

import { test, expect, expectNoHorizontalOverflow } from './fixtures';

test('WebKit runtime evidence identifies the engine and emulated viewport', async ({ browser, page, provider }, testInfo) => {
  expect(browser.browserType().name()).toBe('webkit');
  expect(testInfo.project.use.browserName).toBe('webkit');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const runtime = await page.evaluate(() => ({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight }));
  expect(runtime.userAgent).toContain('AppleWebKit');
  expect(runtime.width).toBe(testInfo.project.use.viewport?.width);
  await expectNoHorizontalOverflow(page);
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
  await testInfo.attach('Linux WebKit runtime evidence — emulation, not a physical device', {
    body: JSON.stringify({ engine: browser.browserType().name(), version: browser.version(), project: testInfo.project.name, isMobile: testInfo.project.use.isMobile, ...runtime }, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('WebKit home viewport', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
});

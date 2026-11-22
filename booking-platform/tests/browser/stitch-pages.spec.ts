import { readdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { syntheticSession, test as fixtureTest } from './fixtures';

for (const [label, service] of [['Bus enquiries','BUS'],['Become a partner','PARTNERSHIP']] as const) {
  fixtureTest(`${service.toLowerCase()} enquiry has a dedicated form and booking desk receipt`, async ({page,provider})=>{
    const reference='ME-111111111111';
    provider.overrides['POST /api/travel/enquiries']={status:201,body:{enquiry:{reference,service,crmStatus:'OFFICE'}}};
    await page.goto('/');
    const directory=page.locator('.concierge-mobile-directory > summary');
    if(await directory.isVisible())await directory.click();
    await page.getByRole('link',{name:label,exact:true}).click();
    const form=page.locator('#office-enquiry form');
    await form.getByLabel(service==='BUS'?'Pickup and destination':'Company name').fill('Synthetic subject');
    await form.getByLabel(service==='BUS'?'Trip date, group size and requirements':'How would you like to work with us?').fill('A synthetic message for the booking desk.');
    await form.getByLabel('Your name',{exact:true}).fill('Test Traveller');
    await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');
    await form.getByRole('checkbox').check();
    await form.getByRole('button',{name:'Send enquiry'}).click();
    await expect(page.locator('#office-enquiry').getByRole('status')).toContainText(reference);
    expect(provider.requests('/api/travel/enquiries')[0].body).toMatchObject({draft:{service},consent:true});
  });
}

const examples = new Map([
  ['/flights/[slug]', '/flights/mumbai-to-goa'],
  ['/flights/routes/page/[page]', '/flights/routes/page/2'],
  ['/hotels/[slug]', '/hotels/test-hotel-10001'],
  ['/hotels/page/[page]', '/hotels/page/2'],
  ['/my-trips/[id]', '/my-trips/33333333-3333-4333-8333-333333333333'],
  ['/packages/[slug]', '/packages/kerala-at-your-pace'],
]);
const blankCataloguePages = new Set(['/flights/routes/page/2', '/hotels/page/2']);
function pageFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? pageFiles(path) : entry.name === 'page.tsx' ? [path] : [];
  });
}

const routes = pageFiles('src/app').map(file => {
  const path = file.slice('src/app'.length).replace(/\/\([^/]+\)/g, '').replace(/\/page\.tsx$/, '') || '/';
  return examples.get(path) ?? path;
});

for (const path of [...new Set([...routes, '/stitch-unknown-page'])].sort()) {
  test(`Stitch theme on ${path}`, async ({page}) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (url.pathname === '/api/auth/get-session') return route.fulfill({json: path === '/book' ? syntheticSession() : null});
      return route.continue();
    });
    const response = await page.goto(path);
    const expectedStatuses = path === '/stitch-unknown-page' ? [404] : blankCataloguePages.has(path) ? [200, 404] : [200];
    expect(expectedStatuses).toContain(response?.status());
    const body = page.locator('body');
    await expect(body).toHaveClass(/\bstitch-theme\b/);
    await expect(body).toHaveCSS('background-color', 'rgb(247, 249, 252)');
    await expect(page.getByRole('main').getByRole('heading', {level: 1}).first()).toBeVisible();
    const logo = page.locator('.maxtravel-logo:visible').first();
    await expect(logo).toHaveAttribute('src', /maxtravel-logo\.jpg/);
    await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    if (path === '/privacy-policy' || path === '/terms-of-use') {
      await expect(page.locator('.legal-effective-date time')).toHaveAttribute('datetime', '2026-10-27');
      await expect(page.locator('.legal-article section')).toHaveCount(path === '/privacy-policy' ? 10 : 9);
      await expect(page.locator('.legal-article a[href="mailto:cs@maxtravel.in"]').first()).toBeVisible();
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://maxtravel.in${path}`);
    }
    if (path === '/') {
      const launcher = page.getByRole('button', {name: 'Open Max AI travel assistant'});
      await expect(launcher).toContainText('Ask Max AI');
      await expect(launcher).not.toContainText(/concierge/i);
      await expect(page.locator('.stitch-ai-card h2')).toHaveText('Ask Max AI');
    }
    if (path.startsWith('/flights') || path.startsWith('/packages') || path === '/about') {
      await expect(page.getByRole('main').getByRole('heading', {level: 1}).first()).toHaveCSS('font-family', /Plus Jakarta Sans/);
    }
    if (!path.startsWith('/operations')) {
      await expect(page.locator('.concierge-header:visible')).toHaveCount(1);
      await expect(page.locator('.concierge-footer:visible')).toHaveCount(1);
    }
    expect(await page.evaluate(async () => {
      await document.fonts.ready;
      const header = document.querySelector('.concierge-bar');
      return Math.max(document.documentElement.scrollWidth, header ? header.scrollWidth : 0) <= innerWidth + 1;
    })).toBe(true);
  });
}

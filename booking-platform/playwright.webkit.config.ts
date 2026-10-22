import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// A bounded Linux WebKit smoke, not a claim of real-device Safari coverage.
// Reuses the strict synthetic browser API and server-side package fixtures.
export default defineConfig(base, {
  testMatch: ['**/search.spec.ts', '**/checkout.spec.ts', '**/packages.spec.ts', '**/journey-studio.spec.ts', '**/webkit-runtime.webkit.ts'],
  grep: /homepage carries canonical airports|fare comparison selects a server fare id|published packages support discovery|hero captions retain contrast|WebKit runtime evidence/,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-webkit', open: 'never' }]],
  outputDir: 'test-results-webkit',
  metadata: { engine: 'Linux WebKit', coverage: 'Desktop and iPhone emulation; not real-device Safari' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 } },
    { name: 'mobile-390', use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
  ],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks against the production build (vite preview of dist/), on the engines and
 * screen sizes the game must work on. Run: npm run build && npm run e2e
 */
const phone = { isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 6,
  timeout: 90_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: 'http://localhost:4173/', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: true },
    // dist/ under the exact headers vercel.json declares (e2e/vercel.spec.ts).
    { command: 'npx tsx scripts/serve-vercel.ts 4180', url: 'http://localhost:4180/', reuseExistingServer: true },
  ],
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'iphone-15', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'iphone-15-landscape', use: { ...devices['iPhone 15 landscape'], browserName: 'webkit' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'iphone-se-3', use: { browserName: 'webkit', viewport: { width: 375, height: 553 }, deviceScaleFactor: 2, ...phone } },
    { name: 'android-360', use: { browserName: 'chromium', viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, ...phone } },
    { name: 'ipad-portrait', use: { ...devices['iPad (gen 7)'], browserName: 'webkit' } },
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'], browserName: 'webkit' } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'], viewport: { width: 1920, height: 1080 } } },
  ],
});

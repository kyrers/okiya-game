import { expect, test } from '@playwright/test';

/** The page under the exact headers vercel.json sends (scripts/serve-vercel.ts on port 4180). */
test.use({ baseURL: 'http://localhost:4180/' });

test('the Vercel security headers and CSP allow everything the game does', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium' && browserName !== 'webkit', 'Chromium and WebKit cover the CSP engines');
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load: ${e.violatedDirective} ${e.blockedURI}`));
  });
  const resp = await page.goto('/');
  const h = resp!.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['x-content-type-options']).toBe('nosniff');
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByRole('dialog', { name: 'New game' }).getByText('The computer', { exact: true }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
  await page.locator('.cell.legal').first().click({ force: true });
  await expect(page.locator('.seat-1.moving .say-order, .game.is-over')).toBeVisible({ timeout: 10_000 });
  expect(violations).toEqual([]);
  const asset = await page.request.get(`/assets/${(await page.locator('script[type=module]').getAttribute('src'))!.split('/').pop()}`);
  expect(asset.headers()['cache-control']).toContain('immutable');
});

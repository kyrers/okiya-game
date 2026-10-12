import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { HOT_SEAT, continueMatch, findGame, saved, seedMatch } from './helpers';

test.describe('installable and offline', () => {
  test('after one visit the game loads and plays with no network', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service-worker offline emulation is checked in Chromium');
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Wait until the service worker controls the page (it claims clients on activation).
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Okiya' })).toBeVisible();
    await page.getByRole('button', { name: /New game/ }).click();
    await page.getByRole('dialog', { name: 'New game' }).getByText('The computer', { exact: true }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    // Whoever opens, the person gets a turn: the computer's worker script came from the cache too.
    await expect(page.locator('.seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
    expect(fonts.join(',')).toContain('Shippori Mincho B1');
  });

  test('the manifest and icons are served', async ({ request }) => {
    const m = await (await request.get('/manifest.webmanifest')).json();
    expect(m.name).toBe('Okiya');
    for (const icon of m.icons) expect((await request.get(icon.src.replace('./', '/'))).ok()).toBe(true);
    for (const f of ['/apple-touch-icon.png', '/favicon-32.png', '/og-image.png', '/icon.svg', '/sw.js']) expect((await request.get(f)).ok()).toBe(true);
  });
});

test.describe('accessibility (axe-core, WCAG 2.2 AA rules)', () => {
  const scan = async (page: import('@playwright/test').Page, label: string) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const v = r.violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.length} × ${x.nodes[0]?.target.join(' ')}`);
    expect(v, label).toEqual([]);
  };

  test('home, sheets and a game in progress have no violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough for a rules-based scan');
    // Colours are measured at rest, not halfway through a sheet fading in.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const g = findGame((s) => s.history.length >= 6, 40);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 3) }]));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await scan(page, 'home');
    await page.getByRole('button', { name: /New game/ }).click();
    await scan(page, 'setup');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'How to play' }).click();
    await scan(page, 'rules');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings' }).click();
    await scan(page, 'settings');
    await page.keyboard.press('Escape');
    await continueMatch(page);
    await scan(page, 'game');
    await page.getByRole('button', { name: 'Menu' }).click();
    await scan(page, 'menu');
  });
});

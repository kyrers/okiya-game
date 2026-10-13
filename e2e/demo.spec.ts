import { expect, test, type Page } from '@playwright/test';
import { layoutProblems, openHome } from './helpers';

/** Watch a game: the engine plays a whole game in a sheet, slowly, saying what happens. */
const sheet = (page: Page) => page.locator('dialog.sheet-demo');
const line = (page: Page) => sheet(page).locator('.demo-say').innerText();
const move = (page: Page) => sheet(page).locator('.demo').getAttribute('data-move');

async function openDemo(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole('button', { name: 'Watch a game' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Watch a game' })).toBeVisible();
}

test('opens from home: the takeable tiles are lifted, and the line follows each move', async ({ page }) => {
  await openDemo(page);
  // The opening: the outer ring may be taken, and the line says so.
  await expect(sheet(page).locator('.cell.show-legal')).toHaveCount(12);
  await expect(sheet(page).locator('.demo-say')).toContainText('outer ring');
  const before = await line(page);
  // A move comes by itself within a few seconds; the line then says who took what, and what the other may take.
  await expect(sheet(page).locator('.demo')).toHaveAttribute('data-move', '1', { timeout: 6000 });
  expect(await line(page)).not.toBe(before);
  await expect(sheet(page).locator('.demo-say')).toContainText(/took .+ may now take any/s);
  expect(await sheet(page).locator('.cell.show-legal').count()).toBeGreaterThan(0);
  await expect(sheet(page).locator('.cell.last')).toHaveCount(1);
  // The garden is a picture: nothing in it can be focused or pressed.
  await expect(sheet(page).locator('.board')).toHaveAttribute('aria-hidden', 'true');
  expect(await sheet(page).locator('.board').evaluate((b) => (b as HTMLElement).inert)).toBe(true);
  // Screen readers hear each line, politely.
  await expect(sheet(page).locator('[aria-live="polite"]')).toContainText('may now take any');
  expect(await layoutProblems(page)).toEqual([]);
});

test('Pause stops it, Next moves it on by one, and the end offers Play again', async ({ page }) => {
  await openDemo(page);
  await sheet(page).getByRole('button', { name: 'Pause' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const paused = await move(page);
  const said = await line(page);
  await page.waitForTimeout(3500);
  expect(await move(page)).toBe(paused);
  expect(await line(page)).toBe(said);
  await sheet(page).getByRole('button', { name: 'Next move' }).click();
  await expect(sheet(page).locator('.demo')).toHaveAttribute('data-move', String(Number(paused) + 1));
  expect(await line(page)).not.toBe(said);
  // Step to the end: who won and why, and a fresh deal on request.
  for (let i = 0; i < 16 && (await sheet(page).getByRole('button', { name: 'Next move' }).isVisible()); i++) {
    await sheet(page).getByRole('button', { name: 'Next move' }).click();
  }
  await expect(sheet(page).locator('.demo-next')).toContainText(/wins: |A tie: /);
  await expect(sheet(page).locator('.cell.show-legal')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Play again' }).click();
  await expect(sheet(page).locator('.demo')).toHaveAttribute('data-move', '0');
  await expect(sheet(page).locator('.cell.show-legal')).toHaveCount(12);
});

test('under reduced motion it waits for Next, and no tile flies', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDemo(page);
  await expect(sheet(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.waitForTimeout(3500);
  expect(await move(page)).toBe('0');
  await sheet(page).getByRole('button', { name: 'Next move' }).click();
  await expect(sheet(page).locator('.demo')).toHaveAttribute('data-move', '1');
  await expect(page.locator('.flyer')).toHaveCount(0);
});

test('closing it leaves nothing running', async ({ page }) => {
  await openDemo(page);
  await expect(sheet(page).locator('.demo')).toHaveAttribute('data-move', '1', { timeout: 6000 });
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  // Watch the whole page for a few move-lengths: nothing changes, and no timer is left behind.
  await page.evaluate(() => {
    const w = window as unknown as { changes: number };
    w.changes = 0;
    new MutationObserver((records) => (w.changes += records.length)).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.waitForTimeout(6500);
  expect(await page.evaluate(() => (window as unknown as { changes: number }).changes)).toBe(0);
  // And it opens again from the home's button, the way back to it.
  await expect(page.getByRole('button', { name: 'Watch a game' })).toBeFocused();
});

test('opens from How to play, and closing it goes back to the rules', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.locator('dialog.sheet-rules').getByRole('button', { name: 'Watch a game' }).click();
  await expect(sheet(page).locator('.cell.show-legal')).toHaveCount(12);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('dialog.sheet-rules')).toBeVisible();
  await expect(page.locator('dialog.sheet-rules').getByRole('button', { name: 'Watch a game' })).toBeFocused();
});

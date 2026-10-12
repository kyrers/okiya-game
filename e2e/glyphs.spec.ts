import { expect, test, type Page } from '@playwright/test';
import { HOT_SEAT, continueMatch, findGame, openHome, saved, seedMatch } from './helpers';

/**
 * Text inside a clipping box (names that end in an ellipsis, two-line button details) must never
 * lose the bottom of a "g" or the top of an "Á". Every line's font box (the font's ascent plus
 * descent, which holds descenders and accents) has to lie inside the element's clip box. Lines a
 * two-line clamp hides on purpose are not counted. Geometry, so it holds in every engine.
 */
const NAMES: [string, string] = ['Diogo', 'Ágqy Jóy'];

async function clippedLines(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) => {
    const out: string[] = [];
    for (const el of els) {
      const box = el.getBoundingClientRect();
      if (box.height === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.height === 0 || r.top >= box.bottom - 1) continue; // a line hidden by the clamp
        if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) {
          out.push(`"${el.textContent}": line ${Math.round(r.top)}-${Math.round(r.bottom)} vs box ${Math.round(box.top)}-${Math.round(box.bottom)}`);
        }
      }
    }
    return out;
  });
}

test('player names keep their descenders and accents in the seats', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = findGame((s) => s.history.length >= 6, 51);
  await seedMatch(page, saved({ ...HOT_SEAT, mode: 'sets3', names: NAMES }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
  await continueMatch(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.seat-name')).toHaveText(['Ágqy Jóy', 'Diogo']);
  expect(await clippedLines(page, '.seat-name')).toEqual([]);
});

test('the Continue and New game details keep their descenders on the home screen', async ({ page }) => {
  const g = findGame((s) => s.history.length >= 6, 52);
  await seedMatch(page, saved({ ...HOT_SEAT, mode: 'sets3', names: NAMES }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
  await openHome(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await clippedLines(page, '.btn.big .btn-sub')).toEqual([]);
});

test('the check itself catches a clipped descender (control: the old tight line height)', async ({ page }) => {
  const g = findGame((s) => s.history.length >= 6, 51);
  await seedMatch(page, saved({ ...HOT_SEAT, mode: 'sets3', names: NAMES }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
  await continueMatch(page);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.seat-name { line-height: 1.15 !important; padding-block: 0 !important; }' });
  expect((await clippedLines(page, '.seat-name')).length).toBeGreaterThan(0);
});

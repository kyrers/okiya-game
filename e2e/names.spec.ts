import { expect, test } from '@playwright/test';
import { HOT_SEAT, continueMatch, findGame, layoutProblems, openHome, saved, seedMatch } from './helpers';

/**
 * Names as people type them: other scripts (right to left, Japanese), accents and apostrophes, and
 * characters that mean something in markup. Each is shown whole and as typed, and never disturbs
 * the layout or the sentence around it. Phone, phone held sideways, and desktop.
 */
const SIZES: [number, number][] = [[360, 640], [844, 390], [1440, 900]];
const NAMES: [string, string][] = [
  ['محمد عبد الرحمن', '山田太郎'],
  ['Zoë Ørsted-Ńàme', "Ana O'Neil"],
  ['<b>Ren</b> & co', 'Aki "the" Fox'],
];

test.describe('names', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!['iphone-15', 'pixel-7', 'desktop-chrome', 'desktop-firefox'].includes(info.project.name), 'one WebKit, one Chromium phone, and two desktop browsers');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const names of NAMES) {
    test(`shown whole and as typed: ${names.join(' / ')}`, async ({ page }) => {
      const g = findGame((s) => s.result?.reason === 'blocked' && s.result.winner === 1, 91);
      await seedMatch(page, saved({ ...HOT_SEAT, mode: 'sets3', names }, [{ ...g, moves: g.moves.slice(0, -1) }]));
      await continueMatch(page);
      await page.locator(`.cell[data-index="${g.moves[g.moves.length - 1]}"]`).click({ force: true });
      await expect(page.locator('.game.is-over')).toBeVisible();
      const problems: string[] = [];
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
        for (const p of await layoutProblems(page)) problems.push(`${w}x${h}: ${p}`);
        await expect(page.locator('.seat-1 .seat-name')).toHaveText(names[0]);
        await expect(page.locator('.seat-2 .seat-name')).toHaveText(names[1]);
        // The loser's name inside the winner's sentence, as typed (markup shown as text).
        await expect(page.locator('.seat.won .say-reason')).toContainText(`${names[1]} has no tile to take`);
      }
      expect(problems).toEqual([]);
      await openHome(page);
      await expect(page.getByRole('button', { name: /Continue/ })).toContainText(`${names[0]} vs ${names[1]}`);
    });
  }
});

test('with reduced motion, a change of style applies at once and starts no transition', async ({ page }) => {
  // The reduced-motion rules once gave every element a 0.001 ms transition of every property;
  // WebKit then reported the old value until the next frame, and the seats' fit measured stale
  // layouts. Zero, not a sliver.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  const result = await page.evaluate(() => {
    // The layout width, not the drawn one: the home's garden is a picture seen at an angle, so its
    // box on screen is not its size.
    const board = document.querySelector<HTMLElement>('.board')!;
    const before = board.offsetWidth;
    board.style.width = `${Math.round(before / 2)}px`;
    const after = board.offsetWidth;
    return { before, after, animations: document.getAnimations().length };
  });
  expect(result.after).toBe(Math.round(result.before / 2));
  expect(result.animations).toBe(0);
});

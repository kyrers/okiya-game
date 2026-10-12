import { expect, test } from '@playwright/test';

/** Players who raise their browser's default text size (here 20px) must still see everything. */
import { HOT_SEAT, continueMatch, findGame, saved, seedMatch } from './helpers';
test('large default text (20px root) still fits', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'html{font-size:20px}'; document.head.append(s); }));
  const g = findGame((s) => s.result !== null && s.result.winner !== null && s.result.tilesRemaining >= 3, 22);
  await seedMatch(page, saved({ ...HOT_SEAT, mode: 'points10' }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
  await continueMatch(page);
  const check = async () => page.evaluate(() => {
    const vh = innerHeight, vw = document.documentElement.clientWidth; const out: string[] = [];
    for (const el of document.querySelectorAll('.game .seat-id, .game .seat-say > *, .game .board, .topbar > *')) { const b = el.getBoundingClientRect(); if (b.height && (b.bottom > vh + 1 || b.top < -1 || b.right > vw + 1)) out.push(el.className + ' ' + Math.round(b.bottom)); }
    const board = document.querySelector('.board')!.getBoundingClientRect();
    for (const el of document.querySelectorAll('.game .seat-id, .game .seat-say > *')) { const b = el.getBoundingClientRect(); if (b.height && b.left < board.right && b.right > board.left && b.top < board.bottom && b.bottom > board.top) out.push('overlap ' + el.className); }
    return { out, board: Math.round(board.width) };
  });
  const a = await check();
  await page.locator(`.cell[data-index="${g.moves[g.moves.length - 1]}"]`).click();
  await expect(page.locator('.game.is-over')).toBeVisible();
  // Settle: fonts, a style recalc, then the garden's size stops changing (it steps back at the end).
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (let i = 0, prev = -1; i < 20; i++) {
    const now = await page.evaluate(() => document.querySelector('.board')!.getBoundingClientRect().width);
    if (now === prev) break;
    prev = now;
    await page.waitForTimeout(120);
  }
  const b = await check();
  expect(b.board).toBeGreaterThan(90);
  expect([...a.out, ...b.out]).toEqual([]);
});

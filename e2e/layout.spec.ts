import { expect, test, type Page } from '@playwright/test';
import { HOT_SEAT, VS_EASY, continueMatch, findGame, openHome, saved, seedMatch } from './helpers';

/**
 * Layout invariants at every device size: nothing scrolls the page, nothing leaves the viewport,
 * the seats never overlap the garden, and every control is a comfortable touch target.
 * Each state is also captured to test-results/screens/ for review.
 */
async function checkLayout(page: Page, label: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Let style recalc happen, then every finite animation and transition settle (sheets sliding
  // in, the garden resizing at the end of a game), and the garden's size stop changing.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity || a.playState !== 'running'),
  );
  // The garden eases to a smaller size when a game ends on short screens.
  if (await page.locator('.game.is-over').count()) await page.waitForTimeout(700);
  const size = () => page.evaluate(() => document.querySelector('.board')?.getBoundingClientRect().width ?? 0);
  for (let i = 0, prev = -1; i < 20; i++) {
    const now = await size();
    if (now === prev) break;
    prev = now;
    await page.waitForTimeout(80);
  }
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${de.scrollWidth} > ${vw}`);
    if (de.scrollHeight > de.clientHeight + 1) out.push(`page scrolls: ${de.scrollHeight} > ${de.clientHeight}`);
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 && !el.closest('.sr-only');
    };
    const dialog = document.querySelector('dialog[open]');
    const scope: Element[] = dialog ? [...dialog.querySelectorAll('.sheet-panel, .sheet-head *, .sheet-foot *')] : [...document.querySelectorAll('.screen *')];
    for (const el of scope) {
      if (!visible(el) || el.closest('.board-brush') || el.classList.contains('glow')) continue;
      const b = el.getBoundingClientRect();
      if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) out.push(`${name(el)} leaves the viewport (${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)} in ${vw}x${vh})`);
    }
    if (dialog) {
      // A sheet sits centred, and its title starts on the same edge as its text.
      const panel = dialog.querySelector('.sheet-panel')!.getBoundingClientRect();
      const gap = Math.abs(panel.left - (vw - panel.right));
      if (gap > 2) out.push(`sheet is off-centre by ${Math.round(gap / 2)}px`);
      const title = dialog.querySelector('.sheet-title')!.getBoundingClientRect();
      const first = dialog.querySelector('.sheet-body > *')!.getBoundingClientRect();
      if (Math.abs(title.left - first.left) > 1) out.push(`sheet title starts at ${Math.round(title.left)}, its text at ${Math.round(first.left)}`);
    }
    const board = document.querySelector('.game .board')?.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    if (board && !dialog) {
      for (const el of document.querySelectorAll('.game .seat-id, .game .seat-pips, .game .seat-say > *, .game .topbar > *')) {
        if (visible(el) && hit(el.getBoundingClientRect(), board)) out.push(`${name(el)} overlaps the garden`);
      }
      const top = document.querySelector('.topbar')!.getBoundingClientRect();
      for (const el of document.querySelectorAll('.game .seat-id, .game .seat-pips, .game .seat-say > *')) {
        if (visible(el) && hit(el.getBoundingClientRect(), top)) out.push(`${name(el)} overlaps the top bar`);
      }
      for (const seat of document.querySelectorAll('.game .seat')) {
        const s = seat.getBoundingClientRect();
        for (const el of seat.querySelectorAll('.seat-id, .seat-pips, .seat-say > *')) {
          const b = el.getBoundingClientRect();
          if (visible(el) && (b.top < s.top - 1 || b.bottom > s.bottom + 1)) out.push(`${name(el)} spills out of its seat`);
        }
      }
    }
    const targets = dialog
      ? dialog.querySelectorAll('button, .seg-opt, .choice, .toggle-row, .name-field')
      : document.querySelectorAll('.screen button:not([aria-hidden="true"] *):not([aria-hidden="true"]):not(.is-over .cell)');
    for (const el of targets) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 43.5 || b.height < 39.5) out.push(`${name(el)} is a small target: ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    for (const el of document.querySelectorAll('.say-order p, .say-result, .say-reason, .btn, .home-sub, .match-label, .sheet-title')) {
      if (!visible(el)) continue;
      const h = el as HTMLElement;
      const ellipsis = getComputedStyle(h).textOverflow === 'ellipsis';
      if (!ellipsis && h.scrollWidth > h.clientWidth + 2) out.push(`${name(el)} text overflows its box`);
    }
    return out;
  });
  await page.screenshot({ path: `test-screens/${test.info().project.name}--${label}.png` });
  expect(problems, label).toEqual([]);
}

const LONG = { ...HOT_SEAT, mode: 'points20' as const, names: ['Mariko Watanabe', 'Wolfgang Amadeus'] as [string, string] };

test('home, setup and the sheets', async ({ page }) => {
  const g = findGame((s) => s.history.length >= 8, 21);
  await seedMatch(page, saved(LONG, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 3) }]));
  await openHome(page);
  await checkLayout(page, '1-home');
  await page.getByRole('button', { name: /New game/ }).click();
  await checkLayout(page, '2-setup-computer');
  await page.getByText('A friend, on this device').click();
  await page.getByText('Victory points').click();
  await checkLayout(page, '3-setup-friend');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'How to play' }).click();
  await checkLayout(page, '4-rules');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await checkLayout(page, '5-settings');
});

test('a two-player game: playing, long names, the end, the next game', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = findGame((s) => s.result !== null && s.result.winner !== null && s.result.tilesRemaining >= 4, 22);
  await seedMatch(page, saved(LONG, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
  await continueMatch(page);
  await checkLayout(page, '6-game-hotseat');
  await page.locator(`.cell[data-index="${g.moves[g.moves.length - 1]}"]`).click();
  await expect(page.locator('.game.is-over')).toBeVisible();
  await checkLayout(page, '7-game-won');
  await page.locator('[data-action="next"]').click();
  await checkLayout(page, '8-next-game-opening');
  await page.getByRole('button', { name: 'Menu' }).click();
  await checkLayout(page, '9-menu');
});

test('against the computer: thinking, and the end of a match', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const open = findGame(() => true, 23);
  await seedMatch(page, saved({ ...VS_EASY, mode: 'sets3' }, [{ tiles: open.tiles, first: 2, moves: [] }]));
  await continueMatch(page);
  await expect(page.locator('.seat-2 .thinking')).toBeVisible();
  await checkLayout(page, '10-computer-thinking');
  await expect(page.locator('.seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
  await checkLayout(page, '11-your-turn');
});

test('the end of a match against the computer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Two finished games won by the person, then a third about to be won: first to 3.
  const won = (seed: number, first: 1 | 2) => findGame((s) => s.result?.winner === 1 && s.history[0].player === first, seed);
  const a = won(31, 1);
  const b = won(32, 2);
  const c = won(33, 2);
  await seedMatch(page, saved({ ...VS_EASY, mode: 'sets3' }, [a, b, { ...c, moves: c.moves.slice(0, -1) }]));
  await continueMatch(page);
  await page.locator(`.cell[data-index="${c.moves[c.moves.length - 1]}"]`).click();
  await expect(page.locator('.seat-1 .say-result')).toHaveText('You win the match');
  await checkLayout(page, '12-match-won');
});

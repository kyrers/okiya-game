import { expect, test, type Page } from '@playwright/test';
import type { SavedMatch } from '../src/game/match';
import { HOT_SEAT, LONG_NAMES, MATCH_KEY, VS_EASY, continueMatch, expectSheetPainted, findGame, layoutProblems, openHome, pickMatch, saved, seatWordBreaks, seedMatch } from './helpers';

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
  const problems = await layoutProblems(page);
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
  await pickMatch(page.getByRole('dialog', { name: 'New game' }), 'Victory points');
  await checkLayout(page, '3-setup-friend');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'How to play' }).click();
  await checkLayout(page, '4-rules');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await checkLayout(page, '5-settings');
});

test('every sheet from a fresh home is painted: opaque and on screen once it has come in', async ({ page }) => {
  // A fresh home, default settings: the case where WebKit once left the sheet invisible over the dimmed home.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openHome(page);
  for (const name of [/^New game/, /How to play/, /Settings/, /Watch a game/]) {
    await page.getByRole('button', { name }).first().click();
    await expect(page.locator('dialog.sheet[open]').getByRole('button', { name: 'Close' })).toBeVisible();
    await expectSheetPainted(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.sheet[open]')).toHaveCount(0);
  }
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

/**
 * The side seat of a phone held sideways is about 140px wide: the computer's card there once read
 * "The / compute / r is / thinking" (a word broken inside, which layoutProblems now catches everywhere). The
 * card shows only while the computer thinks, so a check that ran after it moved is tried again.
 */
test('the computer thinking in the narrow side seat of a phone held sideways', async ({ page, browserName }) => {
  // WebKit under a parallel run often draws the card only after the computer has moved (it thinks
  // for 0.7 s); the steady states are swept in WebKit too (sweep.spec.ts, layoutProblems).
  test.skip(browserName === 'webkit', 'the thinking card is too brief to catch reliably in WebKit');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const open = findGame(() => true, 23);
  const g = findGame((s) => s.history.length >= 6 && s.history[0].player === 1, 23);
  const states: [string, { tiles: typeof open.tiles; first: 1 | 2; moves: number[] }][] = [
    ['the computer opens', { tiles: open.tiles, first: 2, moves: [] }],
    ['the computer thinking', { tiles: g.tiles, first: 1, moves: g.moves.slice(0, 3) }],
  ];
  for (const [w, h] of [[568, 320], [667, 375]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const [label, game] of states) {
      let checked = false;
      for (let attempt = 0; attempt < 6 && !checked; attempt++) {
        await page.goto('/');
        await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MATCH_KEY, JSON.stringify(saved(VS_EASY, [game]))] as const);
        await continueMatch(page);
        // A slow engine may draw the card only after the computer has already moved: try again.
        const seen = await page.locator('.seat-2 .thinking').waitFor({ timeout: 3000 }).then(() => true, () => false);
        if (!seen) continue;
        const broken = await seatWordBreaks(page);
        // Still thinking after the check, so it saw the card.
        checked = (await page.locator('.seat-2 .thinking').count()) > 0;
        if (checked) expect(broken, `${label} @ ${w}x${h}`).toEqual([]);
      }
      expect(checked, `${label} @ ${w}x${h}: the computer moved before the check`).toBe(true);
      expect(await layoutProblems(page), `${label} @ ${w}x${h}, after the computer's move`).toEqual([]);
    }
  }
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

/**
 * Why a game was won (or that the garden is full) is always there to read: in the slip over the
 * garden and in each half, the winner's and the loser's, on a phone held sideways at its shortest
 * and on a small phone upright. Not hidden, not covered, not clipped, not off screen; the slip, seal
 * included, inside the garden, its buttons still 44px tall.
 */
const REASON_SIZES: [number, number][] = [[568, 300], [568, 320], [320, 568]];
for (const [w, h] of REASON_SIZES) {
  test(`the reason a game ended is always shown, ${w}x${h}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: w, height: h });
    const row = findGame((s) => s.result?.reason === 'row');
    const blocked = findGame((s) => s.result?.reason === 'blocked' && s.result.winner === 2, 4);
    const tie = findGame((s) => s.result !== null && s.result.winner === null, 6);
    const long = findGame((s) => s.result?.reason === 'blocked' && s.result.winner === 2, 91);
    const game = (g: typeof row) => [{ tiles: g.tiles, first: g.first, moves: g.moves }];
    const cases: { label: string; match: SavedMatch; why: string; won: string | null; lost: string }[] = [
      { label: 'four in a row', match: saved({ ...HOT_SEAT, mode: 'sets3' }, game(row)), why: 'Four in a row', won: 'Four in a row', lost: 'Four in a row · opens next' },
      // Against the computer, the person lost: their own half says why too.
      { label: 'no tile to take', match: saved({ ...VS_EASY, mode: 'sets3' }, game(blocked)), why: 'You have no tile you may take', won: 'You have no tile you may take', lost: 'You have no tile you may take · you open next' },
      { label: 'a tie', match: saved({ ...HOT_SEAT, mode: 'sets3' }, game(tie)), why: 'The garden is full', won: null, lost: 'The garden is full' },
      { label: 'long names, points', match: saved({ ...HOT_SEAT, mode: 'points20', names: LONG_NAMES }, game(long)), why: `${LONG_NAMES[0]} has no tile to take`, won: `${LONG_NAMES[0]} has no tile to take · +`, lost: `${LONG_NAMES[0]} has no tile to take · opens next` },
    ];
    for (const c of cases) {
      const label = `${c.label} @ ${w}x${h}`;
      await page.goto('/');
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MATCH_KEY, JSON.stringify(c.match)] as const);
      await continueMatch(page);
      await expect(page.locator('.end-card:not(.arriving)')).toBeVisible();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      await expect(page.locator('.end-card .card-why'), label).toHaveText(c.why);
      if (c.won) expect(norm(await page.locator('.seat.won .say-reason').innerText()), label).toContain(c.won);
      const others = page.locator(c.won ? '.seat.lost .say-reason' : '.seat.tie .say-reason');
      await expect(others, label).toHaveCount(c.won ? 1 : 2);
      for (const t of await others.allInnerTexts()) expect(norm(t), label).toContain(c.lost);
      expect(await reasonProblems(page), label).toEqual([]);
      expect(await layoutProblems(page), label).toEqual([]);
    }
  });
}

/** Each reason line, and the slip itself, where it can be read. */
async function reasonProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    type Box = { left: number; top: number; right: number; bottom: number };
    const inside = (a: Box, b: Box) => a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
    const board = document.querySelector('.board')!.getBoundingClientRect();
    const card = document.querySelector<HTMLElement>('.end-card')!;
    const seal = card.querySelector('.card-seal')!.getBoundingClientRect();
    if (!inside(card.getBoundingClientRect(), board)) out.push('the slip leaves the garden');
    if (!inside(seal, board)) out.push('the seal leaves the garden');
    if (card.scrollHeight > card.clientHeight + 1) out.push('the slip spills its content');
    for (const b of card.querySelectorAll('.btn')) if (b.getBoundingClientRect().height < 44) out.push(`a button is ${Math.round(b.getBoundingClientRect().height)}px tall`);
    const seats = [...document.querySelectorAll('.seat')];
    const lines: [Element, Element][] = [[card.querySelector('.card-why') ?? card, card], ...seats.map((s): [Element, Element] => [s.querySelector('.say-reason') ?? s, s])];
    for (const [el, box] of lines) {
      const what = `${box.className.split(' ').slice(0, 3).join('.')} ${el.className}`;
      if (el === box) {
        out.push(`${what}: no reason line`);
        continue;
      }
      const r = el.getBoundingClientRect();
      for (let a: Element | null = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) < 0.99) out.push(`${what}: hidden by ${a.tagName.toLowerCase()}.${a.className}`);
        if (a !== el && cs.overflow !== 'visible' && !inside(r, a.getBoundingClientRect())) out.push(`${what}: clipped by ${a.tagName.toLowerCase()}.${a.className}`);
      }
      if (r.height === 0 || !(el.textContent ?? '').trim()) out.push(`${what}: empty`);
      if (!inside(r, { left: 0, top: 0, right: vw, bottom: vh })) out.push(`${what}: off screen`);
      if (!inside(r, box.getBoundingClientRect())) out.push(`${what}: outside its ${box === card ? 'slip' : 'half'}`);
      // Every line of it drawn on top where it stands: nothing (the slip, its seal) lies over it.
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const line of range.getClientRects()) {
        if (line.width === 0) continue;
        if (!inside(line, r)) out.push(`${what}: text runs outside its box`);
        const hit = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2);
        if (!hit || !el.contains(hit)) out.push(`${what}: covered by ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing'}`);
      }
    }
    return out;
  });
}

/**
 * The game screen is fitted before it is first drawn: on the first frame it is on the page, the
 * seats already hold their content (here the tallest: two 16-letter names, Indigo opening with
 * the note under the order). The fit once waited for the ResizeObserver's first call, which
 * headless WebKit made hundreds of milliseconds after drawing the screen: Indigo's name lay over
 * the top bar, and with large text the order card ran under the screen's foot.
 */
for (const how of ['continue', 'start'] as const) {
  test(`the game screen is fitted when first drawn (${how})`, async ({ page }) => {
    // The smallest phone, where these seats cannot hold their content unfitted, in every engine.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const names: [string, string] = ['Abcdefghijklmnop', 'Pqrstuvwxyzabcde'];
    const g = findGame((s) => s.history.length >= 8, 21);
    if (how === 'continue') await seedMatch(page, saved({ ...HOT_SEAT, names }, [{ tiles: g.tiles, first: 2, moves: [] }]));
    await openHome(page);
    // Checked from a MutationObserver as the screen is added: after the code that put it there,
    // before the browser has drawn it (and before any ResizeObserver has been called).
    const first = page.evaluate(() => new Promise<string[]>((resolve) => {
      new MutationObserver((_, mo) => {
        if (!document.querySelector('.game')) return;
        mo.disconnect();
        const out: string[] = [];
        const vh = innerHeight;
        const top = document.querySelector('.topbar')!.getBoundingClientRect();
        for (const seat of document.querySelectorAll('.game .seat')) {
          const s = seat.getBoundingClientRect();
          for (const el of seat.querySelectorAll('.seat-id, .seat-pips, .seat-say > *')) {
            const b = el.getBoundingClientRect();
            if (!b.height || getComputedStyle(el).display === 'none') continue;
            const what = `${seat.classList[1]} .${el.classList[0]}`;
            if (b.top < top.bottom - 1 && b.bottom > top.top + 1) out.push(`${what} overlaps the top bar`);
            if (b.top < s.top - 1 || b.bottom > s.bottom + 1) out.push(`${what} spills out of its seat`);
            if (b.bottom > vh + 1) out.push(`${what} leaves the screen`);
          }
        }
        resolve(out);
      }).observe(document.body, { childList: true, subtree: true });
    }));
    if (how === 'continue') await page.getByRole('button', { name: /Continue/ }).click();
    else {
      await page.getByRole('button', { name: /New game/ }).click();
      const sheet = page.locator('dialog.sheet-setup');
      await sheet.getByText('A friend, on this').click();
      await sheet.getByRole('textbox', { name: 'Vermilion' }).fill(names[0]);
      await sheet.getByRole('textbox', { name: 'Indigo' }).fill(names[1]);
      // Indigo opens: the first draw after Start decides who opens (match.ts startMatch).
      await page.evaluate(() => {
        const random = Math.random;
        let first = true;
        Math.random = () => (first ? ((first = false), 0.75) : random());
      });
      await sheet.getByRole('button', { name: 'Start' }).click();
    }
    expect(await first).toEqual([]);
    await expect(page.locator('.seat-2')).toHaveClass(/moving/);
  });
}

/**
 * The end slip at a points match's end with the longest names (its tallest content: a headline of
 * three lines, a reason of two, two buttons and See the board) stays inside the garden and the
 * screen, open and folded, wherever the garden is small: every phone held sideways from 300 to
 * 520px tall (the slip once ran See the board off a 568x360 screen) and a small phone upright.
 * The compact slip is chosen by the garden's size, not the screen's.
 */
// A walk through about a hundred sizes, like the size sweep: run with it (@sweep), on its timeout.
test('the end slip fits the garden at every sideways height, open and folded @sweep', async ({ page }) => {
  test.setTimeout(900_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const a = findGame((s) => s.result?.winner === 1 && s.history[0].player === 1 && s.result.tilesRemaining >= 5, 75);
  const b = findGame((s) => s.result?.winner === 1 && s.history[0].player === 2 && s.result.tilesRemaining >= 10 - a.final.result!.tilesRemaining, 76);
  await seedMatch(page, saved({ ...HOT_SEAT, mode: 'points10', names: LONG_NAMES }, [a, { ...b, moves: b.moves.slice(0, -1) }]));
  await continueMatch(page);
  await page.locator(`.cell[data-index="${b.moves[b.moves.length - 1]}"]`).click({ force: true });
  await expect(page.locator('.end-card:not(.arriving) [data-action="home"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const sizes: [number, number][] = [[320, 568]];
  for (const h of [300, 320, 340, 341, 360, 375, 390, 414, 430, 460, 480, 500, 520]) for (const w of [568, 667, 844, 932]) if (w / h >= 1.25) sizes.push([w, h]);
  const out: string[] = [];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const folded of [false, true]) {
      if (folded) await page.locator('.end-card .card-fold').click();
      await expect(page.locator('.seam')).toHaveClass(folded ? /card-folded/ : /^(?!.*card-folded)/);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const found = await page.evaluate((folded) => {
        const vw = document.documentElement.clientWidth;
        const board = document.querySelector('.game .board')!.getBoundingClientRect();
        const card = document.querySelector<HTMLElement>('.end-card')!;
        const parts: [string, Element][] = folded
          ? [...document.querySelectorAll('.end-tab, .end-tab button')].map((el): [string, Element] => [el.className, el])
          : [['slip', card], ['seal', card.querySelector('.card-seal')!], ['reason', card.querySelector('.card-why')!], ['See the board', card.querySelector('.card-fold')!], ...[...card.querySelectorAll('.btn')].map((el): [string, Element] => [el.textContent!.trim(), el])];
        const res: string[] = [];
        for (const [what, el] of parts) {
          const r = el.getBoundingClientRect();
          if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > innerHeight + 1) res.push(`${what} leaves the screen`);
          // The tab straddles the garden's edge on purpose; the open slip lies wholly on the garden.
          if (!folded && (r.left < board.left - 1 || r.top < board.top - 1 || r.right > board.right + 1 || r.bottom > board.bottom + 1)) res.push(`${what} leaves the garden`);
          if (el.tagName === 'BUTTON' && r.height < 44) res.push(`${what} is ${Math.round(r.height)}px tall`);
        }
        if (!folded && card.scrollHeight > card.clientHeight + 1) res.push('the slip spills its content');
        return res;
      }, folded);
      for (const p of found) out.push(`${w}x${h}${folded ? ' folded' : ''}: ${p}`);
      if (folded) await page.locator('.end-tab .tab-show').click();
    }
  }
  expect(out).toEqual([]);
});

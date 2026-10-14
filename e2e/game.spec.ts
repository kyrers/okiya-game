import { expect, test, type Locator } from '@playwright/test';
import { applyMove, newGameFromTiles, tileCode } from '../src/engine/garden';
import { tileWords } from '../src/ui/words';
import {
  HOT_SEAT,
  MATCH_KEY,
  VS_EASY,
  boardCodes,
  continueMatch,
  expectSheetPainted,
  expectTokenPainted,
  expectedLegal,
  findGame,
  holdNextDrop,
  layoutProblems,
  legalIndices,
  openHome,
  pickMatch,
  saved,
  seedMatch,
  tap,
} from './helpers';

/** The brush must actually paint: the garden looks different with the stroke hidden. */
async function expectBrushPainted(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForTimeout(1000);
  // The end card lies over the garden's middle, where a square of four is drawn: set it aside.
  // (and the loop's stepping back while the slip is up: what is checked here is that it is drawn).
  await page.addStyleTag({ content: '.end-card { visibility: hidden !important; } .seam .board-brush { opacity: 1 !important; transition: none !important; }' });
  const board = page.locator('.game .board');
  const withBrush = await board.screenshot({ animations: 'disabled' });
  await page.addStyleTag({ content: '.board-brush { visibility: hidden !important; }' });
  const without = await board.screenshot({ animations: 'disabled' });
  expect(withBrush.equals(without)).toBe(false);
}

test.describe('starting', () => {
  test('home → setup → a game against the computer, first move limited to the outer ring', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).click();
    const sheet = page.getByRole('dialog', { name: 'New game' });
    await expect(sheet).toBeVisible();
    await sheet.getByText('The computer').click();
    await sheet.getByText('Easy', { exact: true }).click();
    // The kind of match waits behind the Match row, which names the current choice; who opens is
    // said beside Start, in view without scrolling.
    await expect(sheet.getByRole('button', { name: 'Match: Single game' })).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet.locator('.setup-note:visible')).toBeInViewport({ ratio: 1 });
    await pickMatch(sheet, 'Single game');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.game')).toBeVisible();
    // Either the person opens (12 outer tiles) or the computer opens and then the constraint applies.
    await expect(page.locator('.seat-1.moving')).toBeVisible({ timeout: 10_000 });
    const codes = await boardCodes(page);
    const tokens = codes.filter((c) => c.startsWith('p') || c === '1' || c === '2').length;
    const legal = await legalIndices(page);
    if (tokens === 0) expect(legal).toEqual([0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    else expect(legal.length).toBeGreaterThan(0);
  });
});

test.describe('the New game sheet', () => {
  test('keeps its choices when closed without starting, and after a reload', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).click();
    const sheet = page.getByRole('dialog', { name: 'New game' });
    await sheet.getByText('A friend, on this device').click();
    await pickMatch(sheet, 'First to 3 wins');
    await sheet.locator('input[name="name1"]').fill('Diogo');
    await sheet.locator('input[name="name2"]').fill('Ana');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await page.getByRole('button', { name: /New game/ }).click();
      await expect(sheet.locator('input[name="opponent"][value="human"]')).toBeChecked();
      await expect(sheet.locator('input[name="match"][value="sets3"]')).toBeChecked();
      // Closed again, naming the choice remembered.
      await expect(sheet.getByRole('button', { name: 'Match: First to 3 wins' })).toHaveAttribute('aria-expanded', 'false');
      await expect(sheet.locator('input[name="name1"]')).toHaveValue('Diogo');
      await expect(sheet.locator('input[name="name2"]')).toHaveValue('Ana');
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }
    // A points target picked, then another kind of match looked at: the target is still there.
    await page.getByRole('button', { name: /New game/ }).click();
    await pickMatch(sheet, 'Victory points', '20 points');
    await expect(sheet.getByRole('button', { name: 'Match: First to 20 points' })).toBeVisible();
    await pickMatch(sheet, 'Single game');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /New game/ }).click();
    await expect(sheet.locator('input[name="match"][value="single"]')).toBeChecked();
    await pickMatch(sheet, 'Victory points');
    await expect(sheet.locator('input[name="target"][value="points20"]')).toBeChecked();
  });

  test('one press on the Match row opens it, straight after typing the names', async ({ page, hasTouch }) => {
    // A name field's change comes on blur, inside the press that moves focus to the Match row. It
    // once rewrote the row's word under the finger, and WebKit then sent no click: the first press
    // did nothing. So the press lands on that word, at the device's own size; and, on touch
    // screens, in the row's middle on the smallest phone held sideways, where the middle is the
    // word (as it was reported).
    const press = (l: Locator) => (hasTouch ? l.tap() : l.click());
    const sizes: ([number, number] | null)[] = hasTouch ? [null, [568, 320]] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize({ width: size[0], height: size[1] });
      await openHome(page);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await press(page.getByRole('button', { name: /New game/ }));
      const sheet = page.getByRole('dialog', { name: 'New game' });
      await press(sheet.getByText('A friend, on this device'));
      for (const [i, name] of ['Abcdefghijklmnop', 'Pqrstuvwxyzabcde'].entries()) {
        await press(sheet.locator(`input[name="name${i + 1}"]`));
        await page.keyboard.type(name);
      }
      await expect(sheet.locator('input[name="name2"]')).toBeFocused();
      const row = sheet.getByRole('button', { name: /^Match/ });
      await press(size ? row : sheet.locator('.more-current'));
      await expect(row, `one press opens the Match row${size ? ` at ${size.join('x')}` : ''}`).toHaveAttribute('aria-expanded', 'true');
      // Seen, not only present: the choices open from transparent, so wait out their animation.
      const options = sheet.locator('.more-options');
      await options.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      expect(await options.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transform])).toEqual(['1', 'none']);
      await expect(options.locator('.choice').first()).toBeInViewport({ ratio: 1 });
      await expect(sheet.locator('input[name="name2"]')).toHaveValue('Pqrstuvwxyzabcde');
    }
  });
});

test.describe('the rules on screen', () => {
  test('the takeable tiles are exactly those sharing the plant or symbol of the tile just taken, every turn of a two-player game', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 12);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    await continueMatch(page);
    let state = newGameFromTiles(g.tiles, g.first);
    for (const m of g.moves) {
      const codes = await boardCodes(page);
      const taken = state.lastTile ? tileCode(state.lastTile) : null;
      expect(await legalIndices(page)).toEqual(expectedLegal(codes, taken));
      await tap(page, m, hasTouch);
      state = applyMove(state, m);
      if (state.result) break;
      await expect(page.locator(`.seat-${state.current}.moving`)).toBeVisible();
    }
    await expect(page.locator('.game.is-over')).toBeVisible();
  });

  test('a tile that does not match is refused, with a reason', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 6);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 3) }]));
    await continueMatch(page);
    const codes = await boardCodes(page);
    const legal = await legalIndices(page);
    const bad = codes.findIndex((c, i) => /^[MCPI][spbr]$/.test(c) && !legal.includes(i));
    test.skip(bad < 0, 'every remaining tile is legal in this position');
    await tap(page, bad, hasTouch);
    // The card's own line says what may be taken instead, no longer than the order it replaces.
    await expect(page.locator('.seat.moving .say-what')).toContainText(/^\s*Only an? /);
    await expect(page.locator('[aria-live]')).toContainText('shares nothing');
    expect((await boardCodes(page))[bad]).toBe(codes[bad]);
  });

  test('four in a row wins and is drawn through the garden', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result?.reason === 'row' || s.result?.reason === 'column');
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await tap(page, g.moves[g.moves.length - 1], hasTouch);
    const winner = g.final.result!.winner!;
    await expect(page.locator(`.seat-${winner}.won .say-result`)).toHaveText('Wins');
    await expect(page.locator(`.seat-${winner}.won .say-reason`)).toHaveText(/Four in a (row|column)/);
    await expect(page.locator('.brush-stroke')).toHaveCount(1);
    await expectBrushPainted(page);
  });

  test('a square of four wins', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result?.reason === 'square');
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await tap(page, g.moves[g.moves.length - 1], hasTouch);
    await expect(page.locator('.seat.won .say-reason')).toHaveText('A square of four');
    await expectBrushPainted(page);
  });

  test('leaving the opponent no tile to take wins', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result?.reason === 'blocked');
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await tap(page, g.moves[g.moves.length - 1], hasTouch);
    const loser = g.final.result!.winner === 1 ? 'Ren' : 'Aki';
    await expect(page.locator('.seat.won .say-reason')).toHaveText(`${loser} has no tile to take`);
  });

  test('a full garden without a formation is a tie', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result?.reason === 'full');
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    expect(await legalIndices(page)).toEqual([g.moves[15]]);
    await tap(page, g.moves[15], hasTouch);
    await expect(page.locator('.seat-1.tie .say-result')).toHaveText('Tie');
    await expect(page.locator('.seat-2.tie .say-result')).toHaveText('Tie');
    await expect(page.locator('.seat-1.tie .say-reason')).toContainText('The garden is full');
    await expect(page.locator('.seat-2.tie .say-reason')).toContainText('The garden is full');
  });
});

test.describe('a move on screen', () => {
  // Motion on (no reduced-motion emulation): the tile flies and the token drops into its cell.
  test('the token set down is painted once its drop is over, and so is the one before it', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 6, 81);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    await continueMatch(page);
    const cell = (i: number) => page.locator(`.game .cell[data-index="${i}"]`);
    await tap(page, 0, hasTouch);
    await expectTokenPainted(page, cell(0));
    const next = (await legalIndices(page))[0];
    await tap(page, next, hasTouch);
    await expectTokenPainted(page, cell(next));
    await expectTokenPainted(page, cell(0));
  });

  test('the token is painted even when the browser runs no frames for its drop', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 6, 81);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    await continueMatch(page);
    await holdNextDrop(page, '.game');
    await tap(page, 0, hasTouch);
    // Held at its first frame, the token is not there; it is at rest well before the next move.
    await expect.poll(() => page.evaluate('window.__heldDrop')).toBe('0');
    await expectTokenPainted(page, page.locator('.game .cell[data-index="0"]'));
  });
});

test.describe('matches', () => {
  test('first to 3: the loser opens the next game, and the score is kept', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result !== null && s.result.winner !== null && s.result.reason !== 'blocked');
    const setup = { ...HOT_SEAT, mode: 'sets3' as const };
    await seedMatch(page, saved(setup, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await tap(page, g.moves[g.moves.length - 1], hasTouch);
    const winner = g.final.result!.winner!;
    const loser = winner === 1 ? 2 : 1;
    await expect(page.locator(`.seat-${winner} .seal.won`)).toHaveCount(1);
    // The buttons are in one card over the garden's middle, not in either half.
    await expect(page.locator('.seat [data-action]')).toHaveCount(0);
    const next = page.locator('.seam .end-card [data-action="next"]');
    await expect(next).toBeVisible();
    await expect(page.locator('.end-card [data-action]')).toHaveCount(1);
    // Hovered, it keeps the winner's dye: its cream text must not vanish into a cream button.
    await expect(page.locator('.end-card:not(.arriving)')).toBeVisible();
    await next.hover();
    await page.waitForTimeout(400); // past the button's colour transition
    expect(await next.evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe('rgb(255, 248, 234)');
    await next.click();
    await expect(page.locator('.end-card')).toBeHidden();
    await expect(page.locator('.match-label')).toContainText('Game 2');
    await expect(page.locator(`.seat-${loser}.moving`)).toBeVisible();
    await expect(page.locator(`.seat-${loser} .say-note`)).toHaveText('Opens after losing the last game.');
    expect((await boardCodes(page)).every((c) => /^[MCPI][spbr]$/.test(c))).toBe(true);
  });

  test('the slip folds away to show the whole garden, and comes back by its tab, the garden or Escape', async ({ page, hasTouch }) => {
    // A square in the middle of the garden: the one formation the slip lies right over.
    const g = findGame((s) => s.result?.reason === 'square' && [5, 6, 9, 10].every((c) => s.result!.cells.includes(c)));
    await seedMatch(page, saved({ ...HOT_SEAT, mode: 'sets3' }, [{ tiles: g.tiles, first: g.first, moves: g.moves }]));
    await continueMatch(page);
    const act = (l: import('@playwright/test').Locator) => (hasTouch ? l.tap() : l.click());
    const card = page.locator('.end-card');
    const see = card.getByRole('button', { name: 'See the board' });
    const winner = g.final.result!.winner === 1 ? 'Aki' : 'Ren';
    const tab = page.getByRole('button', { name: `${winner} wins: show the result` });
    await expect(page.locator('.end-card:not(.arriving)')).toBeVisible();
    await expect(tab).toBeHidden();
    // With the slip over the garden, its loop steps back.
    await expect.poll(() => page.locator('.game .board-brush').evaluate((b) => getComputedStyle(b).opacity)).toBe('0');
    // Folded: the slip is gone, its tab is focused, and every token can be seen.
    await act(see);
    await expect(card).toBeHidden();
    await expect(tab).toBeVisible();
    await expect(tab).toBeFocused();
    const covered = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.game .cell.is-token')].filter((c) => {
        const r = c.getBoundingClientRect();
        const hits = [[0.5, 0.5], [0.5, 0.25], [0.5, 0.72], [0.25, 0.5], [0.75, 0.5]].map(([x, y]) => document.elementFromPoint(r.left + r.width * x, r.top + r.height * y));
        return hits.some((h) => !h || !c.contains(h));
      }).map((c) => c.dataset.index),
    );
    expect(covered).toEqual([]);
    // The win's loop, stepped back while the slip lay over it, is back with the garden.
    await expect.poll(() => page.locator('.game .board-brush').evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
    // The tab still offers the main button, as tall as a finger.
    const tabNext = page.locator('.end-tab [data-card="next"]');
    await expect(tabNext).toBeVisible();
    expect((await tabNext.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    // Back by the tab: focus on the slip's first button.
    await act(tab);
    await expect(card).toBeVisible();
    await expect(tab).toBeHidden();
    await expect(card.locator('[data-action="next"]')).toBeFocused();
    // Back by a tap on the garden.
    await act(see);
    await expect(card).toBeHidden();
    await tap(page, 0, hasTouch);
    await expect(card).toBeVisible();
    // Escape folds it and brings it back.
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(tab).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-action="next"]')).toBeFocused();
    // Next game straight from the tab.
    await act(see);
    await act(tabNext);
    await expect(page.locator('.match-label')).toContainText('Game 2');
    await expect(page.locator('.end-card')).toBeHidden();
    await expect(page.locator('.end-tab')).toBeHidden();
  });

  test('the play by play lists every move of the finished game, from the slip and from the menu', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result?.reason === 'blocked');
    await seedMatch(page, saved({ ...HOT_SEAT, mode: 'sets3' }, [{ tiles: g.tiles, first: g.first, moves: g.moves }]));
    await continueMatch(page);
    const act = (l: Locator) => (hasTouch ? l.tap() : l.click());
    const names = HOT_SEAT.names;
    const loser = names[(g.final.result!.winner === 1 ? 2 : 1) - 1];
    const sheet = page.getByRole('dialog', { name: 'Play by play' });
    const rows = sheet.locator('.record-move');
    const expectRecord = async () => {
      await expectSheetPainted(page);
      await expect(rows).toHaveCount(g.moves.length);
      // Each row is the move's number, who made it and the tile taken; turns alternate from the opener.
      for (const [i, m] of g.moves.entries()) {
        const who = names[(i % 2 === 0 ? g.first : 3 - g.first) - 1];
        await expect(rows.nth(i)).toContainText(`${i + 1}`);
        await expect(rows.nth(i)).toContainText(`${who}: ${tileWords(g.tiles[m])}`);
      }
      // Only the last move says how the game ended.
      await expect(sheet.locator('.record-note')).toHaveCount(1);
      await expect(rows.last().locator('.record-note')).toHaveText(`${loser} has no tile to take`);
      expect(await layoutProblems(page)).toEqual([]);
    };
    await expect(page.locator('.end-card:not(.arriving)')).toBeVisible();
    await act(page.locator('.end-card').getByRole('button', { name: 'Play by play' }));
    await expectRecord();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // Escape closed the sheet only; the slip is still up.
    await expect(page.locator('.end-card')).toBeVisible();
    await act(page.getByRole('button', { name: 'Menu' }));
    await act(page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Play by play' }));
    await expectRecord();
  });

  test('the menu offers the play by play only once a game is over', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result?.reason === 'row');
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 3) }]));
    await continueMatch(page);
    await (hasTouch ? page.getByRole('button', { name: 'Menu' }).tap() : page.getByRole('button', { name: 'Menu' }).click());
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByRole('button', { name: 'How to play' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Play by play' })).toHaveCount(0);
  });

  test('victory points: a win scores the tiles left in the garden', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.result !== null && s.result.winner !== null && s.result.tilesRemaining >= 3);
    const setup = { ...HOT_SEAT, mode: 'points10' as const };
    await seedMatch(page, saved(setup, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await tap(page, g.moves[g.moves.length - 1], hasTouch);
    const r = g.final.result!;
    await expect(page.locator(`.seat-${r.winner} .say-points`)).toHaveText(`+${r.tilesRemaining} points`);
    await expect(page.locator(`.seat-${r.winner} .seat-score b`)).toHaveText(String(r.tilesRemaining));
  });
});

test.describe('against the computer', () => {
  test('a whole game can be played to its end, and the computer always answers', async ({ page, hasTouch }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const g = findGame(() => true, 5);
    await seedMatch(page, saved(VS_EASY, [{ tiles: g.tiles, first: 1, moves: [] }]));
    await continueMatch(page);
    for (let turn = 0; turn < 9; turn++) {
      await expect(page.locator('.game.is-over, .seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
      if (await page.locator('.game.is-over').isVisible()) break;
      const legal = await legalIndices(page);
      expect(legal.length).toBeGreaterThan(0);
      await tap(page, legal[0], hasTouch);
      await expect(page.locator('.cell.legal')).toHaveCount(0);
    }
    await expect(page.locator('.game.is-over')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.seat-1 .say-result')).toHaveText(/^(You win|You lose|Tie)$/);
    await expect(page.locator('.end-card [data-action="again"]')).toBeVisible();
    await expect(page.locator('.end-card [data-action="home"]')).toBeVisible();
  });

  test('the computer thinks off the main thread: the screen never freezes @perf', async ({ page, browserName }) => {
    const g = findGame(() => true, 9);
    await seedMatch(page, saved({ ...VS_EASY, difficulty: 'hard' }, [{ tiles: g.tiles, first: 2, moves: [] }]));
    await page.addInitScript(() => {
      // Longest gap between animation frames while the page runs: a frozen main thread shows here.
      const w = window as unknown as { maxGap: number };
      w.maxGap = 0;
      let last = performance.now();
      // Count only while the computer is thinking: drawing its move afterwards is not the search.
      const tick = (t: number) => {
        if (document.querySelector('.seat-2 .thinking')) w.maxGap = Math.max(w.maxGap, t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await continueMatch(page);
    await expect(page.locator('.seat-2 .thinking')).toBeVisible();
    await page.evaluate(() => ((window as unknown as { maxGap: number }).maxGap = 0));
    await expect(page.locator('.seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
    const gap = await page.evaluate(() => (window as unknown as { maxGap: number }).maxGap);
    // Headless WebKit composites in software and paces animation frames irregularly (1 to 15 frames
    // in the same 700 ms, whatever the page does), so frame gaps are measured in Chromium and
    // Firefox only; in every engine the move must come from the worker.
    if (browserName !== 'webkit') expect(gap).toBeLessThan(300);
    const usedWorker = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /ai\.worker/.test(e.name)));
    expect(usedWorker).toBe(true);
  });

  test('two players on one device have no undo, on screen or in the menu', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 6, 81);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
    await continueMatch(page);
    await tap(page, g.moves[2], hasTouch);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByRole('button', { name: 'How to play' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(menu.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  });

  test('undo takes back your move and the computer’s reply', async ({ page, hasTouch }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const g = findGame(() => true, 11);
    await seedMatch(page, saved(VS_EASY, [{ tiles: g.tiles, first: 1, moves: [] }]));
    await continueMatch(page);
    const before = await boardCodes(page);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await tap(page, (await legalIndices(page))[0], hasTouch);
    await expect(page.locator('.seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
    expect((await boardCodes(page)).filter((c) => c.startsWith('p') || c === '1' || c === '2')).toHaveLength(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => boardCodes(page)).toEqual(before);
    await expect(page.locator('.seat-1.moving')).toBeVisible();
  });
});

test.describe('undo and leaving', () => {
  test('a double tap on Undo takes back one round, not two', async ({ page, hasTouch }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const g = findGame(() => true, 12);
    await seedMatch(page, saved(VS_EASY, [{ tiles: g.tiles, first: 1, moves: [] }]));
    await continueMatch(page);
    const tokens = async () => (await boardCodes(page)).filter((c) => c.startsWith('p') || c === '1' || c === '2').length;
    for (const n of [2, 4]) {
      await tap(page, (await legalIndices(page))[0], hasTouch);
      await expect.poll(tokens, { timeout: 10_000 }).toBe(n);
      await expect(page.locator('.seat-1.moving .say-order')).toBeVisible();
    }
    const undoBtn = page.getByRole('button', { name: 'Undo' });
    await undoBtn.dblclick();
    await expect.poll(tokens).toBe(2);
    await page.waitForTimeout(600);
    expect(await tokens()).toBe(2);
    await undoBtn.click();
    await expect.poll(tokens).toBe(0);
  });

  test('Back from a game closes a confirmation left open, and the match is kept', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 6, 81);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
    await continueMatch(page);
    await tap(page, g.moves[2], hasTouch);
    const before = await boardCodes(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Restart the match' }).click();
    await expect(page.getByRole('dialog', { name: 'Restart the match?' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Paper Garden' })).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect.poll(() => boardCodes(page)).toEqual(before);
  });
});

test.describe('saving', () => {
  test('a match survives a reload and resumes on the same position', async ({ page, hasTouch }) => {
    const g = findGame((s) => s.history.length >= 8, 3);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
    await continueMatch(page);
    await tap(page, g.moves[2], hasTouch);
    await expect(page.locator(`.cell[data-index="${g.moves[2]}"].is-token`)).toBeVisible();
    const codes = await boardCodes(page);
    await page.reload();
    await page.getByRole('button', { name: /Continue/ }).click();
    expect(await boardCodes(page)).toEqual(codes);
  });

  test('a corrupt save is ignored', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paper-garden.match.v1', '{"version":1,"setup":{},"games":[{"tiles":[],"first":3}]}'));
    await openHome(page);
    await expect(page.getByRole('button', { name: /Continue/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /New game/ })).toBeVisible();
  });
});

test.describe('sheets and keys', () => {
  test('how to play opens, scrolls, and closes with Escape', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'How to play' }).click();
    const sheet = page.getByRole('dialog', { name: 'How to play' });
    await expect(sheet.getByRole('heading', { name: 'A full garden' })).toBeAttached();
    // The plants and symbols are named beside the matching rule, not only in the key at the end.
    await expect(sheet.locator('.key-names li')).toHaveText(['Maple', 'Cherry', 'Pine', 'Iris', 'Rising sun', 'Poem', 'Bird', 'Rain']);
    // The tie's fine print is folded under its one-line rule, one press away.
    const ruling = sheet.getByText('this is the ruling of the designer');
    await expect(ruling).toBeAttached();
    await expect(ruling).toBeHidden();
    await sheet.locator('summary', { hasText: 'Whose rule this is, and who opens next' }).click();
    await expect(ruling).toBeVisible();
    await expect(sheet.getByText('the player who did not open the tied game opens the next')).toBeVisible();
    await sheet.locator('.garden-key').scrollIntoViewIfNeeded();
    await expect(sheet.locator('.garden-key .key-tile')).toHaveCount(16);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('the garden can be played with the keyboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard play is a desktop concern');
    const g = findGame((s) => s.history.length >= 4, 4);
    await seedMatch(page, saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    await continueMatch(page);
    await page.locator('.cell[data-index="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.cell[data-index="1"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cell[data-index="1"].is-token')).toBeVisible();
  });

  test('keyboard focus follows the game: into the garden after Start and Next game, kept on the result through a resize', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard play is a desktop concern');
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'New game' }).getByText('A friend, on this device').click();
    await page.getByRole('button', { name: 'Start' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.game .cell.legal:focus')).toHaveCount(1);
    // A game one move from its end, finished from the keyboard.
    const g = findGame((s) => s.result?.reason === 'row' && s.result.tilesRemaining >= 3, 5);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [MATCH_KEY, JSON.stringify(saved({ ...HOT_SEAT, mode: 'sets3' }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, -1) }]))] as const);
    await page.reload();
    await page.getByRole('button', { name: /Continue/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.game .cell.legal:focus')).toHaveCount(1);
    await page.locator(`.cell[data-index="${g.moves[g.moves.length - 1]}"]`).focus();
    await page.keyboard.press('Enter');
    const next = page.locator('.say-actions [data-action="next"]');
    await expect(next).toBeFocused();
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width - 120, height: size.height - 80 });
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.game .cell.legal:focus')).toHaveCount(1);
  });

  test('on a touch screen, no focus ring appears in the garden after Start', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'touch only');
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).tap();
    await page.getByRole('dialog', { name: 'New game' }).getByText('A friend, on this device').tap();
    await page.getByRole('button', { name: 'Start' }).tap();
    await expect(page.locator('.game .cell.legal').first()).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('.game .cell:focus-visible') === null)).toBe(true);
  });

  test('a press dragged from the backdrop into a sheet does not close it', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a mouse press');
    await openHome(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = (await page.locator('dialog[open] .sheet-panel').boundingBox())!;
    await page.mouse.move(4, 4);
    await page.mouse.down();
    await page.mouse.move(panel.x + panel.width / 2, panel.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  });

  test('turning off the lift leaves the takeable tiles unmarked but still takeable', async ({ page, hasTouch }) => {
    await openHome(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByText('Lift the tiles you may take').click();
    await page.keyboard.press('Escape');
    const g = findGame((s) => s.history.length >= 4, 6);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['paper-garden.match.v1', JSON.stringify(saved(HOT_SEAT, [{ tiles: g.tiles, first: g.first, moves: [] }]))] as const);
    await page.reload();
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.locator('.cell.show-legal')).toHaveCount(0);
    expect((await legalIndices(page)).length).toBe(12);
    await tap(page, 0, hasTouch);
    await expect(page.locator('.cell[data-index="0"].is-token')).toBeVisible();
  });
});

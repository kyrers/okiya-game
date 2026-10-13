import { expect, test } from '@playwright/test';
import { applyMove, newGameFromTiles, tileCode } from '../src/engine/garden';
import {
  HOT_SEAT,
  MATCH_KEY,
  VS_EASY,
  boardCodes,
  continueMatch,
  expectedLegal,
  findGame,
  legalIndices,
  openHome,
  saved,
  seedMatch,
  tap,
} from './helpers';

/** The brush must actually paint: the garden looks different with the stroke hidden. */
async function expectBrushPainted(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForTimeout(1000);
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
    await sheet.getByText('Single game').click();
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
    const next = page.locator(`.seat-${loser} [data-action="next"]`);
    await expect(next).toBeVisible();
    await next.click();
    await expect(page.locator('.match-label')).toContainText('Game 2');
    await expect(page.locator(`.seat-${loser}.moving`)).toBeVisible();
    await expect(page.locator(`.seat-${loser} .say-note`)).toHaveText('Opens after losing the last game.');
    expect((await boardCodes(page)).every((c) => /^[MCPI][spbr]$/.test(c))).toBe(true);
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
    await expect(page.locator('.seat-1 [data-action="again"]')).toBeVisible();
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
    await expect(sheet.getByText('this is the ruling of the designer')).toBeAttached();
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

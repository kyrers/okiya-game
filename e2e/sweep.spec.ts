import { expect, test, type Page } from '@playwright/test';
import { HOT_SEAT, LONG_NAMES, MATCH_KEY, VS_EASY, continueMatch, findGame, layoutProblems, openHome, saved, seedMatch } from './helpers';
import type { MatchSetup } from '../src/game/match';

/**
 * The layout rules (helpers.ts, layoutProblems) on a dense sweep of screen sizes, not only on
 * named devices: every common phone width against every height from 520 to 932 px in portrait,
 * every landscape phone height from 300 to 430 px, tablets both ways, and desktops. Each state is
 * set up once and the viewport is resized under it. Two-player states use the longest names the
 * form accepts, in wide letters with no space to break at. Runs in WebKit (iPhone 15 project),
 * Chromium as a phone (Pixel 7 project), and as desktop browsers whose windows are made small (a
 * desktop Chrome at scale 2 and Firefox at scale 1: mouse, no touch), which is how a desktop
 * player sees these sizes.
 */
const PORTRAIT: [number, number][] = [];
for (const w of [320, 360, 375, 390, 412, 430]) for (const h of [520, 568, 600, 640, 667, 700, 720, 740, 760, 780, 800, 844, 900, 932]) PORTRAIT.push([w, h]);
const LANDSCAPE: [number, number][] = [];
for (const h of [300, 320, 340, 360, 375, 390, 414, 430]) for (const w of [568, 640, 667, 700, 740, 780, 812, 844, 896, 932]) LANDSCAPE.push([w, h]);
const TABLETS: [number, number][] = [];
for (const [w, h] of [[744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]] as [number, number][]) TABLETS.push([w, h], [h, w]);
/** Portrait screens shorter than the sweep's, where the opener's note moves to the waiting seat. */
const SHORT: [number, number][] = [[320, 454], [320, 460], [320, 480], [360, 480], [375, 480], [320, 500], [390, 500]];
const DESKTOPS: [number, number][] = [[1024, 640], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440]];

function sizesFor(project: string): [number, number][] {
  if (project === 'desktop-chrome' || project === 'desktop-firefox') return [...DESKTOPS, ...PORTRAIT, ...LANDSCAPE, ...TABLETS];
  if (project === 'pixel-7' || project === 'iphone-15') return [...PORTRAIT, ...LANDSCAPE, ...TABLETS];
  return [];
}

const FRIENDS: MatchSetup = { ...HOT_SEAT, names: LONG_NAMES };

async function settle(page: Page): Promise<void> {
  // Two frames for style and layout, a third for the seats' refit, which runs in a frame callback.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
}

/** Resize through every size, optionally re-arming the state, and collect every broken rule. */
async function sweep(
  page: Page,
  label: string,
  sizes: [number, number][],
  rearm?: () => Promise<void>,
  extra?: (w: number, h: number) => Promise<string[]>,
): Promise<string[]> {
  const out: string[] = [];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page);
    if (rearm) await rearm();
    await settle(page);
    for (const p of await layoutProblems(page)) out.push(`${label} @ ${w}x${h}: ${p}`);
    if (extra) for (const p of await extra(w, h)) out.push(`${label} @ ${w}x${h}: ${p}`);
  }
  return out;
}

/**
 * On a phone held sideways, the new-game form shows every one of its sections (the heading and
 * the first option) without scrolling, so the choices can be seen side by side. The client's
 * finding: in one long column only one option showed at a time.
 */
async function setupAtAGlance(w: number, h: number, page: Page): Promise<string[]> {
  if (h > 520 || w / h < 1.25) return [];
  return page.evaluate(() => {
    const body = document.querySelector('dialog[open] .sheet-body')!.getBoundingClientRect();
    const top = Math.max(body.top, 0);
    const bottom = Math.min(body.bottom, innerHeight);
    const out: string[] = [];
    for (const f of document.querySelectorAll<HTMLElement>('dialog[open] .setup fieldset')) {
      if (f.hidden || f.getBoundingClientRect().height === 0) continue;
      const legend = f.querySelector('legend')!.getBoundingClientRect();
      const first = f.querySelector('input')!.getBoundingClientRect();
      if (legend.top < top - 0.5 || first.bottom > bottom + 0.5) {
        out.push(`"${f.querySelector('legend')!.textContent}" is not on screen without scrolling (${Math.round(legend.top)} to ${Math.round(first.bottom)}, visible ${Math.round(top)} to ${Math.round(bottom)})`);
      }
    }
    return out;
  });
}

/**
 * The opener's note is shown once, whole, inside a seat: the mover's, or on the shortest screens
 * the waiting player's (game.ts fitSeats, step 3).
 */
async function noteShown(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const notes = [...document.querySelectorAll<HTMLElement>('.seat .say-note')];
    if (!notes.length) return ['no opener note'];
    const shown = notes.filter((n) => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0);
    if (shown.length > 1) return ['the opener note is shown twice'];
    if (!shown.length) return [`the opener note "${notes[0].textContent}" is hidden`];
    const note = shown[0];
    const r = note.getBoundingClientRect();
    const seat = note.closest('.seat')!.getBoundingClientRect();
    if (r.top < seat.top - 1 || r.bottom > seat.bottom + 1) return ['the opener note spills out of its seat'];
    return [];
  });
}

/** Plays the last move of a seeded game, so the screen shows its end. */
async function finish(page: Page, index: number): Promise<void> {
  await page.locator(`.cell[data-index="${index}"]`).click({ force: true });
  await expect(page.locator('.game.is-over')).toBeVisible();
}

test.describe('size sweep @sweep', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(sizesFor(info.project.name).length === 0, 'the sweep runs in one WebKit and one Chromium phone project, desktop Chrome and Firefox');
    // 176 sizes per state on phones, 183 on desktops (plus 7 short ones in the note test); WebKit
    // resizes slowly.
    test.setTimeout(15 * 60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('home, with a two-player match to continue', async ({ page }, info) => {
    const g = findGame((s) => s.history.length >= 6, 61);
    await seedMatch(page, saved({ ...FRIENDS, mode: 'points20' }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
    await openHome(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await sweep(page, 'home', sizesFor(info.project.name))).toEqual([]);
  });

  test('the opening move of a two-player match, with the opener note', async ({ page }, info) => {
    const g = findGame((s) => s.history.length >= 6, 62);
    await seedMatch(page, saved({ ...FRIENDS, mode: 'points20' }, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    await continueMatch(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await sweep(page, 'opening', sizesFor(info.project.name), undefined, () => noteShown(page))).toEqual([]);
  });

  test('the opening of game 2, opened by the loser of game 1', async ({ page }, info) => {
    const a = findGame((s) => s.result?.winner === 1 && s.history[0].player === 1, 71);
    const b = findGame((s) => s.history.length >= 6 && s.history[0].player === 2, 72);
    await seedMatch(page, saved({ ...FRIENDS, mode: 'sets3' }, [a, { tiles: b.tiles, first: 2, moves: [] }]));
    await continueMatch(page);
    await expect(page.locator('.seat-2 .say-note')).toHaveText('Opens after losing the last game.');
    expect(await sweep(page, 'game 2 opening', sizesFor(info.project.name), undefined, () => noteShown(page))).toEqual([]);
  });

  test('a game won by leaving no tile to take, the match going on', async ({ page }, info) => {
    const g = findGame((s) => s.result?.reason === 'blocked' && s.result.winner === 1, 73);
    await seedMatch(page, saved({ ...FRIENDS, mode: 'sets3' }, [{ ...g, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await finish(page, g.moves[g.moves.length - 1]);
    await expect(page.locator('.seat.won .say-reason')).toContainText('has no tile to take');
    await expect(page.locator('[data-action="next"]')).toBeVisible();
    expect(await sweep(page, 'won, next game', sizesFor(info.project.name))).toEqual([]);
  });

  test('a tie, the match going on', async ({ page }, info) => {
    const g = findGame((s) => s.result !== null && s.result.winner === null, 74);
    await seedMatch(page, saved({ ...FRIENDS, mode: 'sets3' }, [{ ...g, moves: g.moves.slice(0, -1) }]));
    await continueMatch(page);
    await finish(page, g.moves[g.moves.length - 1]);
    await expect(page.locator('.say-result').first()).toHaveText('Tie');
    expect(await sweep(page, 'tie', sizesFor(info.project.name))).toEqual([]);
  });

  test('the end of a victory-points match between two players', async ({ page }, info) => {
    const a = findGame((s) => s.result?.winner === 1 && s.history[0].player === 1 && s.result.tilesRemaining >= 5, 75);
    const b = findGame((s) => s.result?.winner === 1 && s.history[0].player === 2 && s.result.tilesRemaining >= 10 - a.final.result!.tilesRemaining, 76);
    await seedMatch(page, saved({ ...FRIENDS, mode: 'points10' }, [a, { ...b, moves: b.moves.slice(0, -1) }]));
    await continueMatch(page);
    await finish(page, b.moves[b.moves.length - 1]);
    await expect(page.locator('.seat-1 .say-result')).toHaveText('Wins the match');
    expect(await sweep(page, 'points match won', sizesFor(info.project.name))).toEqual([]);
  });

  test('a refused tile against the computer, with its explanation', async ({ page }, info) => {
    const g = findGame((s) => s.history.length >= 8, 63);
    await seedMatch(page, saved({ ...VS_EASY, mode: 'sets3' }, [{ tiles: g.tiles, first: 1, moves: [] }]));
    await continueMatch(page);
    await page.locator('.cell.legal').first().click({ force: true });
    await expect(page.locator('.seat-1.moving .say-order')).toBeVisible({ timeout: 10_000 });
    const tapRefused = async () => {
      const bad = await page.locator('.game .cell.is-tile:not(.legal)').first();
      if (await bad.count()) await bad.click({ force: true });
    };
    await tapRefused();
    await expect(page.locator('.seat.moving .nope-word')).toBeVisible();
    expect(await sweep(page, 'refused', sizesFor(info.project.name), tapRefused)).toEqual([]);
  });

  test('the end of a match against the computer', async ({ page }, info) => {
    const won = (seed: number, first: 1 | 2) => findGame((s) => s.result?.winner === 1 && s.history[0].player === first, seed);
    const a = won(64, 1);
    const b = won(65, 2);
    const c = won(66, 2);
    await seedMatch(page, saved({ ...VS_EASY, mode: 'sets3' }, [a, b, { ...c, moves: c.moves.slice(0, -1) }]));
    await continueMatch(page);
    await page.locator(`.cell[data-index="${c.moves[c.moves.length - 1]}"]`).click({ force: true });
    await expect(page.locator('.seat-1 .say-result')).toHaveText('You win the match');
    expect(await sweep(page, 'match won', sizesFor(info.project.name))).toEqual([]);
  });

  test('the new-game sheet, against the computer', async ({ page }, info) => {
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).click();
    expect(await sweep(page, 'setup (computer)', sizesFor(info.project.name), undefined, (w, h) => setupAtAGlance(w, h, page))).toEqual([]);
  });

  test('the new-game sheet, between friends with victory points and long names', async ({ page }, info) => {
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).click();
    const setup = page.getByRole('dialog', { name: 'New game' });
    await setup.getByText('A friend, on this device').click();
    await setup.locator('input[name="name1"]').fill(LONG_NAMES[0]);
    await setup.locator('input[name="name2"]').fill(LONG_NAMES[1]);
    await setup.getByText('Victory points').click();
    // Each name field shows the whole name typed in it.
    const namesWhole = () => page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('dialog[open] .name-field input')]
      .filter((i) => i.scrollWidth > i.clientWidth + 1)
      .map((i) => `the name field shows only part of "${i.value}" (${i.clientWidth} of ${i.scrollWidth}px)`));
    expect(await sweep(page, 'setup (friends, points)', sizesFor(info.project.name), undefined, async (w, h) => [...(await setupAtAGlance(w, h, page)), ...(await namesWhole())])).toEqual([]);
  });

  test('the rules sheet', async ({ page }, info) => {
    await openHome(page);
    await page.getByRole('button', { name: 'How to play' }).click();
    expect(await sweep(page, 'rules', sizesFor(info.project.name))).toEqual([]);
  });

  test('the in-game menu, settings and a confirmation', async ({ page }, info) => {
    const g = findGame((s) => s.history.length >= 6, 77);
    await seedMatch(page, saved({ ...VS_EASY, mode: 'sets3' }, [{ tiles: g.tiles, first: 1, moves: [] }]));
    await continueMatch(page);
    const sizes = sizesFor(info.project.name);
    await page.getByRole('button', { name: 'Menu' }).click();
    const problems = await sweep(page, 'menu', sizes);
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Settings' }).click();
    problems.push(...(await sweep(page, 'settings', sizes)));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Restart the match' }).click();
    await expect(page.getByRole('dialog', { name: 'Restart the match?' })).toBeVisible();
    problems.push(...(await sweep(page, 'confirm', sizes)));
    expect(problems).toEqual([]);
  });

  test('the opener note shows at every size, and the garden keeps its size after the first move', async ({ page, hasTouch }, info) => {
    const g = findGame((s) => s.history.length >= 6, 62);
    const value = JSON.stringify(saved({ ...FRIENDS, mode: 'sets3' }, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    // Every load starts from the same opening, whatever the page saved as it left.
    await page.addInitScript(([key, v]) => localStorage.setItem(key, v), [MATCH_KEY, value] as const);
    const out: string[] = [];
    for (const [w, h] of [...SHORT, ...sizesFor(info.project.name)]) {
      await page.setViewportSize({ width: w, height: h });
      await continueMatch(page);
      await expect(page.locator('.game .cell.legal').first()).toBeVisible();
      await settle(page);
      for (const p of await noteShown(page)) out.push(`${w}x${h}: ${p}`);
      const before = await page.locator('.game .board').boundingBox();
      const cell = page.locator('.game .cell.legal').first();
      if (hasTouch) await cell.tap();
      else await cell.click();
      await expect(page.locator('.game .say-note')).toHaveCount(0);
      await expect(page.locator('.game[data-busy]')).toHaveCount(0);
      await settle(page);
      const after = await page.locator('.game .board').boundingBox();
      if (Math.abs(before!.width - after!.width) > 0.5 || Math.abs(before!.y - after!.y) > 0.5) {
        out.push(`${w}x${h}: the garden moved or changed size after the first move (${Math.round(before!.width)} at ${Math.round(before!.y)} → ${Math.round(after!.width)} at ${Math.round(after!.y)})`);
      }
    }
    expect(out).toEqual([]);
  });
});

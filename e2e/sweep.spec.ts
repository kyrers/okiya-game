import { expect, test, type Page } from '@playwright/test';
import { HOT_SEAT, VS_EASY, continueMatch, findGame, layoutProblems, openHome, saved, seedMatch } from './helpers';

/**
 * The layout rules (helpers.ts, layoutProblems) on a dense sweep of screen sizes, not only on
 * named devices: every common phone width against every height from 520 to 932 px in portrait,
 * every landscape phone height from 300 to 430 px, tablets both ways, and desktops. Each state is
 * set up once and the viewport is resized under it. Runs in WebKit (iPhone 15 project) and
 * Chromium (Pixel 7 project for phones and tablets, desktop Chrome for desktops).
 */
const PORTRAIT: [number, number][] = [];
for (const w of [320, 360, 375, 390, 412, 430]) for (const h of [520, 568, 600, 640, 667, 700, 720, 740, 760, 780, 800, 844, 900, 932]) PORTRAIT.push([w, h]);
const LANDSCAPE: [number, number][] = [];
for (const h of [300, 320, 340, 360, 375, 390, 414, 430]) for (const w of [568, 640, 667, 700, 740, 780, 812, 844, 896, 932]) LANDSCAPE.push([w, h]);
const TABLETS: [number, number][] = [];
for (const [w, h] of [[744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]] as [number, number][]) TABLETS.push([w, h], [h, w]);
const DESKTOPS: [number, number][] = [[1024, 640], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440]];

function sizesFor(project: string): [number, number][] {
  if (project === 'desktop-chrome') return DESKTOPS;
  if (project === 'pixel-7' || project === 'iphone-15') return [...PORTRAIT, ...LANDSCAPE, ...TABLETS];
  return [];
}

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

test.describe('size sweep @sweep', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(sizesFor(info.project.name).length === 0, 'the sweep runs in one WebKit and one Chromium phone project, and desktop Chrome');
    // About 190 sizes per state; WebKit resizes slowly.
    test.setTimeout(10 * 60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('home, with a match to continue', async ({ page }, info) => {
    const g = findGame((s) => s.history.length >= 6, 61);
    await seedMatch(page, saved({ ...HOT_SEAT, mode: 'points20', names: ['Mariko Watanabe', 'Diogo Gyllenhaal'] }, [{ tiles: g.tiles, first: g.first, moves: g.moves.slice(0, 2) }]));
    await openHome(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await sweep(page, 'home', sizesFor(info.project.name))).toEqual([]);
  });

  test('the opening move of a two-player match, with the opener note', async ({ page }, info) => {
    const g = findGame((s) => s.history.length >= 6, 62);
    await seedMatch(page, saved({ ...HOT_SEAT, mode: 'points20', names: ['Mariko Watanabe', 'Diogo Gyllenhaal'] }, [{ tiles: g.tiles, first: g.first, moves: [] }]));
    await continueMatch(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await sweep(page, 'opening', sizesFor(info.project.name))).toEqual([]);
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

  test('the new-game sheet, between friends with victory points', async ({ page }, info) => {
    await openHome(page);
    await page.getByRole('button', { name: /New game/ }).click();
    await page.getByRole('dialog', { name: 'New game' }).getByText('A friend, on this device').click();
    await page.getByRole('dialog', { name: 'New game' }).getByText('Victory points').click();
    expect(await sweep(page, 'setup (friends, points)', sizesFor(info.project.name), undefined, (w, h) => setupAtAGlance(w, h, page))).toEqual([]);
  });

  test('the rules sheet', async ({ page }, info) => {
    await openHome(page);
    await page.getByRole('button', { name: 'How to play' }).click();
    expect(await sweep(page, 'rules', sizesFor(info.project.name))).toEqual([]);
  });
});

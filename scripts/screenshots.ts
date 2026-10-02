/**
 * Drives the app through its screens at phone, tablet and desktop widths and saves PNGs
 * to docs/screenshots/. Needs a server: `npm run dev` (default http://localhost:5173/)
 * or `npm run preview` with BASE_URL=http://localhost:4173/.
 *
 * Usage: npx tsx scripts/screenshots.ts [outDir=docs/screenshots]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { chooseMove } from '../src/engine/ai';
import { applyMove, legalMoves, mulberry32 } from '../src/engine/okiya';
import { fireflyHints } from '../src/game/hints';
import { newRun, pickCharm, startGame, type RunState } from '../src/game/run';

const RUN_KEY = 'hanamichi.run.v1';

/**
 * Build, through the real engine, a run paused at a position where it is the human's move and
 * the Firefly marks at least one winning tile and one dangerous tile. Used so the screenshots
 * show the hint and a won tally.
 */
function seededFireflyRun(): RunState {
  for (let seed = 1; seed < 5000; seed++) {
    let run = newRun(seed);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    const rng = mulberry32(seed);
    let g = run.game!;
    while (!g.win) {
      if (g.current === 1) {
        const hints = fireflyHints(g, 1);
        const vals = [...hints.values()];
        if (vals.includes('win') && vals.includes('danger') && g.history.length >= 6) {
          return { ...run, game: g, nextFirst: run.nextFirst };
        }
      }
      const legal = legalMoves(g);
      g = applyMove(g, g.current === 1 ? legal[Math.floor(rng() * legal.length)] : chooseMove(g, { depth: 1, rng }).index);
    }
  }
  throw new Error('no suitable position found');
}

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = process.argv[2] ?? 'docs/screenshots';
const SIZES = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
} as const;

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('saved', `${OUT}/${name}.png`);
}

async function humanMove(page: Page): Promise<boolean> {
  // Wait until it is the human's turn (board has legal cells) or the game ended.
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.sheet.result:visible').count()) return false;
    const legal = page.locator('.board.has-legal .cell.legal');
    if (await legal.count()) {
      // Prefer a tile that is not an immediate loss: just take the first legal one.
      await legal.first().click();
      await page.waitForTimeout(900);
      return true;
    }
    await page.waitForTimeout(200);
  }
  return false;
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
  for (const [label, size] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
      isMobile: size.isMobile,
      hasTouch: size.hasTouch,
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.title-screen');
    await shot(page, `${label}-1-title`);
    await page.click('[data-action="daily-run"]');
    await page.waitForSelector('.draft-screen');
    await shot(page, `${label}-2-draft`);
    await page.click('.charm-card');
    await page.waitForSelector('.intro-screen');
    await shot(page, `${label}-3-station`);
    await page.click('[data-action="start-game"]');
    await page.waitForSelector('.play-screen .board');
    // Make a few moves for the mid-game capture.
    for (let i = 0; i < 3; i++) await humanMove(page);
    for (let i = 0; i < 40 && !(await page.locator('.board.has-legal').count()); i++) await page.waitForTimeout(200);
    await shot(page, `${label}-4-play`);
    // Firefly and result: resume a seeded position where the hint marks tiles and a win is available.
    const seeded = seededFireflyRun();
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [RUN_KEY, JSON.stringify(seeded)] as const);
    await page.reload();
    await page.waitForSelector('.title-screen');
    await page.click('[data-action="resume"]');
    await page.waitForSelector('.board.has-legal');
    const firefly = page.locator('[data-action="firefly"]:visible:not([disabled])');
    await firefly.first().click();
    await page.waitForSelector('.badge-win');
    await shot(page, `${label}-5-firefly`);
    await page.click('.board .cell.legal.firefly-win');
    await page.waitForSelector('.sheet.result:visible', { timeout: 15000 });
    await shot(page, `${label}-6-result`);
    // Rules sheet.
    await page.click('.sheet.result:visible [data-action="continue"]');
    await page.waitForTimeout(300);
    await page.click('.topbar [data-action="rules"]');
    await page.waitForSelector('.sheet.rules');
    await shot(page, `${label}-7-rules`);
    if (errors.length) console.log(`[${label}] page errors:`, errors);
    await ctx.close();
  }
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

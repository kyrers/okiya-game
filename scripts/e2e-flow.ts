/**
 * End-to-end flow check with Playwright against the dev server (http://localhost:5173/).
 * Seeds localStorage with run states built through the real run module + engine, reloads,
 * and clicks through: result → draft → intro; full-hand release; lost run; resume with a
 * finished game; resume with the AI to move. Fails (exit 1) on any page error or missing screen.
 *
 * Usage: npx tsx scripts/e2e-flow.ts
 */
import { chromium, type Page } from 'playwright';
import { chooseMove } from '../src/engine/ai';
import { CHARMS } from '../src/engine/charms';
import { applyMove } from '../src/engine/okiya';
import { newRun, pickCharm, startGame, type RunState } from '../src/game/run';
import { STATIONS } from '../src/game/stations';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const KEY = 'hanamichi.run.v1';

function playToEnd(run: RunState): RunState {
  let g = run.game!;
  let i = 0;
  while (!g.win) g = applyMove(g, chooseMove(g, { depth: 1, rng: () => (i++ % 5) / 5 }).index);
  return { ...run, game: g };
}

async function seed(page: Page, run: RunState) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(run)] as const);
  await page.reload();
  await page.waitForSelector('.title-screen');
  await page.click('[data-action="resume"]');
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const checks: string[] = [];
  const ok = (name: string) => { checks.push(`ok   ${name}`); console.log('ok  ', name); };

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());

  // A. Cleared station → draft → pick → intro of station 2.
  {
    let run = newRun(123);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = playToEnd(run);
    // Pretend the station is already cleared: finishGame requires a finished game in 'playing'.
    run = { ...run, stationPetals: STATIONS[0].target };
    await seed(page, run);
    await page.waitForSelector('.sheet.result:visible', { timeout: 5000 });
    ok('A1 finished game on resume is tallied');
    await page.click('.sheet.result:visible [data-action="continue"]');
    await page.waitForSelector('.draft-screen', { timeout: 5000 });
    ok('A2 cleared station leads to the draft');
    const offers = await page.locator('.charm-grid .charm-card[data-action="pick"]').count();
    if (offers !== 3) throw new Error(`expected 3 offers, got ${offers}`);
    await page.click('.charm-grid .charm-card[data-action="pick"]');
    await page.waitForSelector('.intro-screen');
    const place = await page.textContent('.intro .place');
    if (place?.trim() !== STATIONS[1].place) throw new Error(`expected station 2 intro, got ${place}`);
    ok('A3 pick → station 2 intro');
  }

  // B. Full hand: picking a 5th charm asks to release one.
  {
    let run = newRun(321);
    run = { ...run, phase: 'draft', station: 2, held: CHARMS.slice(0, 4).map((c) => c.id), offers: CHARMS.slice(4, 7).map((c) => c.id) };
    await seed(page, run);
    await page.waitForSelector('.draft-screen');
    await page.click('.charm-grid .charm-card[data-action="pick"]');
    await page.waitForSelector('.notice');
    ok('B1 full hand shows the release notice');
    await page.click('.charm-card[data-action="release"]');
    await page.waitForSelector('.intro-screen');
    const chips = await page.locator('.intro .charm-chip').count();
    if (chips !== 4) throw new Error(`expected 4 held charms after release, got ${chips}`);
    ok('B2 release → 4 charms held → intro');
  }

  // C. Lanterns spent without the target → lost screen → walk again → start draft.
  {
    let run = newRun(555);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = playToEnd(run);
    run = { ...run, gamesPlayed: 2, stationPetals: 0 };
    await seed(page, run);
    await page.waitForSelector('.sheet.result:visible');
    await page.click('.sheet.result:visible [data-action="continue"]');
    await page.waitForSelector('.end-screen .end.lost', { timeout: 5000 });
    ok('C1 third lost lantern ends the run');
    await page.click('[data-action="new-run"]');
    await page.waitForSelector('.draft-screen');
    ok('C2 walk again starts a fresh draft');
  }

  // D. Resume with the AI to move: it moves by itself.
  {
    let run = newRun(777);
    run = pickCharm(run, run.offers[0]);
    run = { ...run, nextFirst: 2 };
    run = startGame(run);
    await seed(page, run);
    await page.waitForSelector('.play-screen');
    await page.waitForSelector('.cell-token.token-p2', { timeout: 5000 });
    ok('D1 rival opens automatically on resume');
    await page.waitForSelector('.board.has-legal');
    const legal = await page.locator('.board .cell.legal').count();
    if (legal < 1 || legal > 6) throw new Error(`unexpected legal count ${legal}`);
    ok(`D2 human has ${legal} legal replies (constraint applied)`);
    // Illegal cells must not be clickable: click one and verify nothing changes.
    const before = await page.locator('.cell-token').count();
    const illegal = page.locator('.board .cell-tile:not(.legal)').first();
    if (await illegal.count()) {
      await illegal.click({ force: true });
      await page.waitForTimeout(300);
      const after = await page.locator('.cell-token').count();
      if (after !== before) throw new Error('an illegal tile was accepted');
      ok('D3 clicking an illegal tile does nothing');
    }
  }

  // E. Rules sheet opens and closes.
  await page.click('.topbar [data-action="rules"]');
  await page.waitForSelector('.sheet.rules');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet.rules', { state: 'detached' });
  ok('E1 rules sheet opens and closes with Escape');

  await browser.close();
  if (errors.length) {
    console.error('PAGE ERRORS:', errors);
    process.exit(1);
  }
  console.log(`\n${checks.length} checks passed, no page errors`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

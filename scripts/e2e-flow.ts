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
import { applyMove, mulberry32 } from '../src/engine/okiya';
import { continueRun, finishGame, newRun, pickCharm, startGame, validateRun, type RunState } from '../src/game/run';
import { STATIONS } from '../src/game/stations';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const KEY = 'hanamichi.run.v1';

/** Finish the current game: the human searches `humanDepth` plies, the rival uses its station settings. */
function playToEnd(run: RunState, humanDepth = 1, salt = 0): RunState {
  const rng = mulberry32((run.seed + salt) >>> 0);
  const st = STATIONS[run.station];
  let g = run.game!;
  while (!g.win) g = applyMove(g, chooseMove(g, g.current === 1 ? { depth: humanDepth, rng } : { ...st.ai, rng }).index);
  return { ...run, game: g };
}

/**
 * A legitimate run (built only through the state machine) paused in 'playing' with a finished
 * game that, once tallied, clears station 1. Searched over seeds.
 */
function aboutToClearStation(): RunState {
  for (let seed = 1; seed < 500; seed++) {
    let run = newRun(seed);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    for (let g = 0; g < 3; g++) {
      run = playToEnd(run, 4, g);
      const tallied = finishGame(run);
      if (tallied.stationPetals >= STATIONS[0].target) return run;
      const next = continueRun(tallied);
      if (next.phase !== 'playing') break;
      run = next;
    }
  }
  throw new Error('no seed clears station 1 within 3 games');
}

/**
 * A legitimate run drafting at station 5 with a full hand of 4 charms: the first pick plus one
 * per cleared station, so four stations must be cleared. Searched over seeds.
 */
function fullHandDraft(): RunState {
  for (let seed = 1; seed < 3000; seed++) {
    let run = newRun(seed);
    run = pickCharm(run, run.offers[0]);
    let ok = true;
    for (let station = 0; station < 4 && ok; station++) {
      run = startGame(run);
      for (let g = 0; g < 3; g++) {
        run = playToEnd(run, 4, station * 10 + g);
        const next = continueRun(finishGame(run));
        if (next.phase === 'draft') { run = next; break; }
        if (next.phase !== 'playing') { ok = false; break; }
        run = next;
      }
      if (!ok || run.phase !== 'draft') { ok = false; break; }
      if (station < 3) run = pickCharm(run, run.offers[0]);
    }
    if (ok && run.phase === 'draft' && run.station === 4 && run.held.length === 4) return run;
  }
  throw new Error('no seed clears four stations');
}

/** A legitimate run paused in 'playing' with the third game finished and lost (station not cleared). */
function aboutToLose(): RunState {
  for (let seed = 1; seed < 500; seed++) {
    let run = newRun(seed);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    let ok = true;
    for (let g = 0; g < 3; g++) {
      const rng = mulberry32(seed * 7 + g);
      let game = run.game!;
      // The human plays randomly, the rival plays its station settings.
      while (!game.win) {
        const legal = chooseMove(game, { depth: 1, rng }).moves;
        game = applyMove(game, game.current === 1 ? legal[Math.floor(rng() * legal.length)] : chooseMove(game, { ...STATIONS[0].ai, rng }).index);
      }
      run = { ...run, game };
      if (g === 2) break;
      const next = continueRun(finishGame(run));
      if (next.phase !== 'playing') { ok = false; break; }
      run = next;
    }
    if (!ok) continue;
    const tallied = finishGame(run);
    if (tallied.stationPetals < STATIONS[0].target) return run;
  }
  throw new Error('no seed loses station 1');
}

async function seed(page: Page, run: RunState) {
  // Every seeded state must be one the app itself could have saved.
  if (!validateRun(JSON.parse(JSON.stringify(run)))) throw new Error('e2e seed is not a legitimate run state');
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
    const run = aboutToClearStation();
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
    const run = fullHandDraft();
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
    const run = aboutToLose();
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
    // Pick a seed whose coin toss makes the rival open (newRun chooses at random from the seed).
    let run = newRun(777);
    for (let seed = 777; run.nextFirst !== 2; seed++) run = newRun(seed);
    run = pickCharm(run, run.offers[0]);
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

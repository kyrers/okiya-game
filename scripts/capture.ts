/**
 * Captures the share image (public/og-image.jpg) and the documentation screenshots
 * (docs/screenshots/) from a running build. Positions are real games, built by the engine.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx tsx scripts/capture.ts [baseUrl]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { applyMove, legalMoves, mulberry32, newGame, type GameState, type Player, type Tile } from '../src/engine/garden';
import type { MatchSetup, SavedMatch } from '../src/game/match';

const base = process.argv[2] ?? 'http://localhost:4173/';
const root = new URL('../', import.meta.url).pathname;
mkdirSync(`${root}docs/screenshots`, { recursive: true });

function findGame(want: (g: GameState) => boolean, seed: number): { tiles: Tile[]; first: Player; moves: number[] } {
  for (let n = 0; n < 50_000; n++) {
    const rng = mulberry32(seed * 7919 + n);
    const first: Player = n % 2 === 0 ? 1 : 2;
    const start = newGame(seed * 31 + n, first);
    let g = start;
    const moves: number[] = [];
    while (!g.result) {
      const legal = legalMoves(g);
      const m = legal[Math.floor(rng() * legal.length)];
      moves.push(m);
      g = applyMove(g, m);
    }
    if (want(g)) return { tiles: start.board.map((c) => (c.kind === 'tile' ? c.tile : null)) as Tile[], first, moves };
  }
  throw new Error('no game found');
}

/** Where the share image comes from, written into the file itself (docs/ASSETS.md). */
const OG_ORIGIN =
  "impeccable:prompt\u0000Origin: screenshot of this game's own home screen at 1200x630, captured by scripts/capture.ts (Playwright Chromium) from the production build. Everything in it (tiles, textures, type set in the OFL Shippori Mincho B1 and Source Sans 3) is original or OFL-licensed. No external, stock or generated imagery.";

/** The JPEG with a comment (COM) segment holding `text`, after the JFIF header when there is one. */
function withComment(jpeg: Buffer, text: string): Buffer {
  const body = Buffer.from(text, 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xfffe, 0);
  head.writeUInt16BE(body.length + 2, 2);
  const at = jpeg.readUInt16BE(2) === 0xffe0 ? 4 + jpeg.readUInt16BE(4) : 2;
  return Buffer.concat([jpeg.subarray(0, at), head, body, jpeg.subarray(at)]);
}

const VS: MatchSetup = { opponent: 'computer', difficulty: 'medium', mode: 'sets3', names: ['You', 'Computer'] };
const FRIENDS: MatchSetup = { opponent: 'human', difficulty: 'medium', mode: 'points10', names: ['Aki', 'Ren'] };

// A game against the computer, the person to move, a few tiles in.
const mid = findGame((g) => g.history.length >= 9 && g.history[0].player === 2, 4);
const midSaved: SavedMatch = { version: 1, setup: VS, games: [{ ...mid, moves: mid.moves.slice(0, 5) }] };
// A two-player game about to be won with a row; the capture plays the winning tile.
const win = findGame((g) => g.result?.reason === 'row' && g.result.tilesRemaining >= 4, 9);
const winSaved: SavedMatch = { version: 1, setup: FRIENDS, games: [{ ...win, moves: win.moves.slice(0, -1) }] };

async function open(page: Page, saved: SavedMatch | null): Promise<void> {
  await page.goto(base);
  await page.evaluate((s) => {
    localStorage.clear();
    if (s) localStorage.setItem('paper-garden.match.v1', s);
  }, saved ? JSON.stringify(saved) : null);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(700);
}

interface Device {
  name: string;
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
  engine: 'chromium' | 'webkit';
}

const DEVICES: Device[] = [
  { name: 'phone', width: 390, height: 844, scale: 3, mobile: true, engine: 'webkit' },
  { name: 'phone-landscape', width: 844, height: 390, scale: 3, mobile: true, engine: 'webkit' },
  { name: 'tablet', width: 820, height: 1180, scale: 2, mobile: true, engine: 'webkit' },
  { name: 'desktop', width: 1440, height: 900, scale: 2, mobile: false, engine: 'chromium' },
];

const browsers: Record<string, Browser> = { chromium: await chromium.launch(), webkit: await webkit.launch() };

for (const d of DEVICES) {
  const ctx = await browsers[d.engine].newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.scale,
    isMobile: d.mobile,
    hasTouch: d.mobile,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const shot = async (label: string) => {
    await settle(page);
    await page.screenshot({ path: `${root}docs/screenshots/${d.name}-${label}.png` });
    console.log(`docs/screenshots/${d.name}-${label}.png`);
  };

  await open(page, midSaved);
  await shot('1-home');

  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('.seat-1.moving .say-order').waitFor();
  await shot('2-your-turn');

  await open(page, winSaved);
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator(`.cell[data-index="${win.moves[win.moves.length - 1]}"]`).click();
  await page.locator('.game.is-over').waitFor();
  await shot('3-game-won');

  await open(page, null);
  await page.getByRole('button', { name: /New game/ }).click();
  await shot('4-new-game');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'How to play' }).click();
  await shot('5-how-to-play');

  if (d.name === 'desktop') {
    // The share image: the home screen at the standard 1200x630.
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1200, height: 630 });
    await open(page, null);
    await settle(page);
    const jpeg = await page.screenshot({ scale: 'css', type: 'jpeg', quality: 85 });
    writeFileSync(`${root}public/og-image.jpg`, withComment(jpeg, OG_ORIGIN));
    console.log('public/og-image.jpg');
  }
  await ctx.close();
}
await Promise.all(Object.values(browsers).map((b) => b.close()));

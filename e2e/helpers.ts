import { expect, type Page } from '@playwright/test';
import { applyMove, legalMoves, mulberry32, newGame, type GameState, type Player, type Tile } from '../src/engine/okiya';
import type { MatchSetup, SavedMatch } from '../src/game/match';

export const MATCH_KEY = 'okiya.match.v1';

/** Store a match before the page loads, as if it had been saved by an earlier visit. */
export async function seedMatch(page: Page, saved: SavedMatch): Promise<void> {
  await page.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', '1');
    }
  }, [MATCH_KEY, JSON.stringify(saved)] as const);
}

export interface Played {
  tiles: Tile[];
  first: Player;
  moves: number[];
  final: GameState;
}

/** Random legal games from seeded gardens until one ends the way `want` says. */
export function findGame(want: (g: GameState) => boolean, seed = 1): Played {
  for (let n = 0; n < 20000; n++) {
    const rng = mulberry32(seed * 100_003 + n);
    const first: Player = n % 2 === 0 ? 1 : 2;
    const start = newGame(seed * 7 + n, first);
    let g = start;
    const moves: number[] = [];
    while (!g.result) {
      const legal = legalMoves(g);
      const m = legal[Math.floor(rng() * legal.length)];
      moves.push(m);
      g = applyMove(g, m);
    }
    if (want(g)) {
      const tiles = start.board.map((c) => (c.kind === 'tile' ? c.tile : null)) as Tile[];
      return { tiles, first, moves, final: g };
    }
  }
  throw new Error('no such game found');
}

export function saved(setup: MatchSetup, games: { tiles: Tile[]; first: Player; moves: number[] }[]): SavedMatch {
  return { version: 1, setup, games };
}

export const HOT_SEAT: MatchSetup = { opponent: 'human', difficulty: 'medium', mode: 'single', names: ['Aki', 'Ren'] };
export const VS_EASY: MatchSetup = { opponent: 'computer', difficulty: 'easy', mode: 'single', names: ['You', 'Computer'] };

export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Okiya' })).toBeVisible();
}

export async function continueMatch(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.locator('.game')).toBeVisible();
}

/** Tile codes on the board, or 'p1'/'p2' for tokens, from the DOM. */
export async function boardCodes(page: Page): Promise<string[]> {
  return page.locator('.game .cell').evaluateAll((cells) => cells.map((c) => (c as HTMLElement).dataset.cell ?? ''));
}

export async function legalIndices(page: Page): Promise<number[]> {
  return page.locator('.game .cell.legal').evaluateAll((cells) => cells.map((c) => Number((c as HTMLElement).dataset.index)));
}

/** Take the cell at `index` the way the device would: a tap on touch screens, a click otherwise. */
export async function tap(page: Page, index: number, touch: boolean): Promise<void> {
  await page.locator('.game:not([data-busy])').waitFor();
  const cell = page.locator(`.game .cell[data-index="${index}"]`);
  // force: tiles that may not be taken are aria-disabled, yet a finger can still land on them.
  if (touch) await cell.tap({ force: true });
  else await cell.click({ force: true });
}

const VEG: Record<string, string> = { M: 'maple', C: 'cherry', P: 'pine', I: 'iris' };
const SYM: Record<string, string> = { s: 'sun', p: 'poem', b: 'bird', r: 'rain' };

/** The legal cells by the rules, computed from what the screen shows (board + taken tile). */
export function expectedLegal(codes: string[], taken: string | null): number[] {
  const out: number[] = [];
  codes.forEach((c, i) => {
    if (c.length !== 2 || c[0] === 'p') return;
    if (taken === null) {
      const r = Math.floor(i / 4);
      const col = i % 4;
      if (r === 0 || r === 3 || col === 0 || col === 3) out.push(i);
    } else if (VEG[c[0]] === VEG[taken[0]] || SYM[c[1]] === SYM[taken[1]]) out.push(i);
  });
  return out;
}

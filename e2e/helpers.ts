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


/**
 * Every layout rule the app keeps, checked on the page as it stands: no page scroll, nothing off
 * screen, seats never on the garden or the top bar and never spilling out, touch targets, text
 * that overflows its box, sheets centred with title and text on one edge and room for content.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${de.scrollWidth} > ${vw}`);
    if (de.scrollHeight > de.clientHeight + 1) out.push(`page scrolls: ${de.scrollHeight} > ${de.clientHeight}`);
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 && !el.closest('.sr-only');
    };
    const dialog = document.querySelector('dialog[open]');
    const scope: Element[] = dialog ? [...dialog.querySelectorAll('.sheet-panel, .sheet-head *, .sheet-foot *')] : [...document.querySelectorAll('.screen *')];
    for (const el of scope) {
      if (!visible(el) || el.closest('.board-brush') || el.classList.contains('glow')) continue;
      const b = el.getBoundingClientRect();
      if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) out.push(`${name(el)} leaves the viewport (${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)} in ${vw}x${vh})`);
    }
    if (dialog) {
      // A sheet sits centred, and its title starts on the same edge as its text.
      const panel = dialog.querySelector('.sheet-panel')!.getBoundingClientRect();
      const gap = Math.abs(panel.left - (vw - panel.right));
      if (gap > 2) out.push(`sheet is off-centre by ${Math.round(gap / 2)}px`);
      const title = dialog.querySelector('.sheet-title')!.getBoundingClientRect();
      const first = dialog.querySelector('.sheet-body > *')!.getBoundingClientRect();
      if (Math.abs(title.left - first.left) > 1) out.push(`sheet title starts at ${Math.round(title.left)}, its text at ${Math.round(first.left)}`);
      // The content keeps most of the sheet: a title bar and a button may not squeeze it.
      const sb = dialog.querySelector('.sheet-body')!.getBoundingClientRect();
      if (sb.height < Math.min(120, vh * 0.3) || sb.height < panel.height * 0.45) out.push(`sheet content is only ${Math.round(sb.height)}px of a ${Math.round(panel.height)}px sheet`);
    }
    const board = document.querySelector('.game .board')?.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    if (board && !dialog) {
      for (const el of document.querySelectorAll('.game .seat-id, .game .seat-pips, .game .seat-say > *, .game .topbar > *')) {
        if (visible(el) && hit(el.getBoundingClientRect(), board)) out.push(`${name(el)} overlaps the garden`);
      }
      const top = document.querySelector('.topbar')!.getBoundingClientRect();
      for (const el of document.querySelectorAll('.game .seat-id, .game .seat-pips, .game .seat-say > *')) {
        if (visible(el) && hit(el.getBoundingClientRect(), top)) out.push(`${name(el)} overlaps the top bar`);
      }
      for (const seat of document.querySelectorAll('.game .seat')) {
        const s = seat.getBoundingClientRect();
        for (const el of seat.querySelectorAll('.seat-id, .seat-pips, .seat-say > *')) {
          const b = el.getBoundingClientRect();
          if (visible(el) && (b.top < s.top - 1 || b.bottom > s.bottom + 1)) out.push(`${name(el)} spills out of its seat`);
        }
      }
    }
    const targets = dialog
      ? dialog.querySelectorAll('button, .seg-opt, .choice, .toggle-row, .name-field')
      : document.querySelectorAll('.screen button:not([aria-hidden="true"] *):not([aria-hidden="true"]):not(.is-over .cell)');
    for (const el of targets) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 43.5 || b.height < 39.5) out.push(`${name(el)} is a small target: ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    for (const el of document.querySelectorAll('.say-order p, .say-result, .say-reason, .btn, .home-sub, .match-label, .sheet-title')) {
      if (!visible(el)) continue;
      const h = el as HTMLElement;
      const ellipsis = getComputedStyle(h).textOverflow === 'ellipsis';
      if (!ellipsis && h.scrollWidth > h.clientWidth + 2) out.push(`${name(el)} text overflows its box`);
    }
    return out;
  });
}

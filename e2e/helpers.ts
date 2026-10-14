import { expect, type Locator, type Page } from '@playwright/test';
import { applyMove, legalMoves, mulberry32, newGame, type GameState, type Player, type Tile } from '../src/engine/garden';
import type { MatchSetup, SavedMatch } from '../src/game/match';

export const MATCH_KEY = 'paper-garden.match.v1';

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
/** The longest names the form accepts (NAME_MAX), in wide letters with no space to break at. */
export const LONG_NAMES: [string, string] = ['Wmmmmmmmmmmmmmmm', 'WWWWWWWWWWWWWWWW'];

/**
 * Waits until the open sheet (the topmost one not waiting behind another) has finished its entrance,
 * then checks that it is painted: opaque, untransformed, and on screen. toBeVisible() alone passes
 * for a sheet at opacity 0, which is how a sheet once stayed invisible over a dimmed home in WebKit.
 * The assertions retry: a single read right after the entrance can see a stale frame.
 */
export async function expectSheetPainted(page: Page): Promise<void> {
  const sheet = page.locator('dialog.sheet[open]:not(.is-behind)').last();
  const panel = sheet.locator('.sheet-panel');
  await expect(sheet).toHaveCount(1);
  await expect
    .poll(() => sheet.evaluate((d) => d.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length))
    .toBe(0);
  await expect(sheet).toHaveCSS('opacity', '1');
  await expect(sheet).toHaveCSS('transform', 'none');
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(panel).toHaveCSS('transform', 'none');
  await expect
    .poll(() =>
      panel.evaluate((p) => {
        const r = p.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        return r.width > 0 && r.height > 0 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= vh + 0.5 && r.right <= vw + 0.5;
      }),
    )
    .toBe(true);
}

export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Paper Garden' })).toBeVisible();
}

export async function continueMatch(page: Page): Promise<void> {
  await openHome(page);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.locator('.game')).toBeVisible();
}

/**
 * Picks a kind of match in the New game sheet (and a points target), opening its Match row first
 * if it is closed: the kind of match waits behind that row.
 */
export async function pickMatch(sheet: Locator, title: string, target?: string): Promise<void> {
  const row = sheet.getByRole('button', { name: /^Match/ });
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  await sheet.locator('.choice').getByText(title, { exact: true }).click();
  if (target) await sheet.locator('.seg.small').getByText(target, { exact: true }).click();
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
 * The token in `cell` is painted at rest: its drop is over, it and every element above it are at
 * full opacity and visible, and the cell's pixels change when the token alone is hidden.
 * (toBeVisible passes for a token at opacity 0, so it is not enough.) Screenshots keep animations
 * running: `animations: 'disabled'` would finish a drop that the browser never ran.
 */
export async function expectTokenPainted(page: Page, cell: Locator): Promise<void> {
  const token = cell.locator('.token');
  await expect(token).toHaveCount(1);
  // The drop is over well within the time a player waits before the next move: finished, or gone.
  await expect
    .poll(() => token.evaluate((tok) => tok.getAnimations().filter((a) => a.playState !== 'finished').map((a) => `${(a as CSSAnimation).animationName ?? 'animation'} ${a.playState} at ${a.currentTime}`)), {
      message: 'the token is still dropping',
      timeout: 3000,
    })
    .toEqual([]);
  const unseen = await token.evaluate((tok) => {
    const out: string[] = [];
    for (let e: Element | null = tok; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.opacity !== '1' || s.visibility !== 'visible') out.push(`${e.tagName}.${e.getAttribute('class') ?? ''}: opacity ${s.opacity}, ${s.visibility}`);
    }
    return out;
  });
  expect(unseen, 'the token or an element above it is not fully shown').toEqual([]);
  const shown = await cell.screenshot();
  const hide = await page.addStyleTag({ content: '.cell .token { visibility: hidden !important; }' });
  const hidden = await cell.screenshot();
  await hide.evaluate((s) => (s as Element).remove());
  expect(shown.equals(hidden), 'the token adds nothing to the cell on screen').toBe(false);
}

/**
 * Holds the drop of the next token set down in `root` at its first frame, as a browser that runs no
 * frames for a while does (headless WebKit under load ran none for seconds, and the token stayed
 * at its first, invisible frame).
 */
export async function holdNextDrop(page: Page, root: string): Promise<void> {
  // A string: functions given to page.evaluate lose their inner named functions in some builds.
  await page.evaluate(`(() => {
    const root = ${JSON.stringify(root)};
    new MutationObserver((records, obs) => {
      const tok = document.querySelector(root + ' .cell.placed .token');
      if (!tok) return;
      for (const a of tok.getAnimations()) { a.pause(); a.currentTime = 0; }
      window.__heldDrop = getComputedStyle(tok).opacity;
      obs.disconnect();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  })()`);
}

/**
 * Every layout rule the app keeps, checked on the page as it stands: no page scroll, nothing off
 * screen, seats never on the garden or the top bar and never spilling out, touch targets, text
 * that overflows its box, sheets centred with title and text on one edge and room for content.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return [...(await page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${de.scrollWidth} > ${vw}`);
    if (de.scrollHeight > de.clientHeight + 1) out.push(`page scrolls: ${de.scrollHeight} > ${de.clientHeight}`);
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    // Text clipped away to nothing (the screen-reader-only pattern, by .sr-only or by a media rule,
    // as the home's link labels on a short sideways phone) is not on screen to check.
    const clippedAway = (el: Element) => {
      for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).clip === 'rect(0px, 0px, 0px, 0px)') return true;
      return false;
    };
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 && !el.closest('.sr-only') && !clippedAway(el);
    };
    const dialog = document.querySelector('dialog[open]');
    const scope: Element[] = dialog ? [...dialog.querySelectorAll('.sheet-panel, .sheet-head *, .sheet-foot *')] : [...document.querySelectorAll('.screen *')];
    for (const el of scope) {
      if (!visible(el) || el.closest('.board-brush') || el.classList.contains('glow')) continue;
      const b = el.getBoundingClientRect();
      if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) out.push(`${name(el)} leaves the viewport (${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)} in ${vw}x${vh})`);
    }
    if (dialog) {
      // A sheet that has come in rests in its place: nothing of its entrance is left on it (WebKit
      // once held it on a frame of its rise after the animation had finished, a few pixels low).
      const moving = dialog.getAnimations().some((a) => a.playState === 'running');
      const transform = getComputedStyle(dialog).transform;
      if (!moving && transform !== 'none') out.push(`sheet rests out of place: ${transform}`);
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
      ? dialog.querySelectorAll('button:not([inert] *), summary, .seg-opt, .choice, .toggle-row, .name-field')
      : document.querySelectorAll('.screen button:not([aria-hidden="true"] *):not([aria-hidden="true"]):not(.is-over .cell)');
    for (const el of targets) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 43.5 || b.height < 39.5) out.push(`${name(el)} is a small target: ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    // No text runs outside its box: every line of every visible text stays within the block that
    // holds it (a long word, such as a 16-letter name, must break or shrink, not spill).
    const roots = dialog ? [dialog] : [...document.querySelectorAll('.screen')];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue ?? '';
        if (!text.trim()) continue;
        const el = n.parentElement!;
        if (!visible(el) || el.closest('svg, .sr-only')) continue;
        let box: Element = el;
        while (box.parentElement && ['inline', 'contents'].includes(getComputedStyle(box).display)) box = box.parentElement;
        const cs = getComputedStyle(box);
        const clamp = cs.getPropertyValue('-webkit-line-clamp');
        // Truncation on purpose (an ellipsis, a line clamp) is checked below instead.
        if (cs.textOverflow === 'ellipsis' || (clamp && clamp !== 'none')) continue;
        const b = box.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          if (r.width > 0 && (r.left < b.left - 1 || r.right > b.right + 1)) {
            out.push(`text "${text.trim().slice(0, 20)}" runs outside ${name(box)} (${Math.round(r.left)}-${Math.round(r.right)} in ${Math.round(b.left)}-${Math.round(b.right)})`);
            break;
          }
        }
      }
    }
    // Names and the Continue summary are never cut short. Measured with any clamp lifted, where the
    // text is laid out in full: a clamped box in Chromium draws an ellipsis while reporting neither
    // a scroll overflow nor text past its edge. Cut short: a line runs past the box, or there are
    // more lines than the box shows (its line clamp, or one line when it does not wrap).
    const shown = (h: HTMLElement) => {
      const cs = getComputedStyle(h);
      const clamp = parseInt(cs.getPropertyValue('-webkit-line-clamp'), 10);
      return cs.whiteSpace === 'nowrap' ? 1 : Number.isFinite(clamp) ? clamp : Infinity;
    };
    const texts = [...document.querySelectorAll<HTMLElement>('.seat-name, .btn.big .btn-sub')].filter((el) => visible(el) && (!dialog || dialog.contains(el)));
    const allowed = texts.map(shown);
    const lift = document.createElement('style');
    lift.textContent = '.seat-name, .btn.big .btn-sub { display: block !important; -webkit-line-clamp: none !important; overflow: visible !important; text-overflow: clip !important; }';
    document.head.append(lift);
    texts.forEach((h, i) => {
      const cs = getComputedStyle(h);
      const b = h.getBoundingClientRect();
      const left = b.left + parseFloat(cs.paddingLeft);
      const right = b.right - parseFloat(cs.paddingRight);
      const range = document.createRange();
      range.selectNodeContents(h);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const lines = new Set(rects.map((r) => Math.round(r.top))).size;
      // Strict: a clipping box ellipsises any overflow, even a fraction of a pixel.
      const wide = rects.some((r) => r.right > right + 0.05 || r.left < left - 0.05);
      if (wide || lines > allowed[i]) out.push(`${name(h)} is cut short: "${(h.textContent ?? '').trim().slice(0, 30)}" (${lines} lines of ${allowed[i]}${wide ? ', too wide' : ''})`);
    });
    lift.remove();
    return out;
  })), ...(await seatWordBreaks(page))];
}

/**
 * A seat's words are never broken inside ("The compute / r is thinking"): every letter of a word
 * sits on one line. Only a player's name (a <bdi>) may break where it must. Quick enough to run
 * while the computer's short-lived thinking card is on screen.
 */
export async function seatWordBreaks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    if (!document.querySelector('dialog[open]')) {
      for (const el of document.querySelectorAll('.game .seat-say p')) {
        if (getComputedStyle(el).display === 'none' || el.getBoundingClientRect().height === 0) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let word: number[] = [];
        let letters = '';
        const flush = () => {
          if (new Set(word).size > 1) out.push(`${name(el)} breaks the word "${letters}" across lines`);
          word = [];
          letters = '';
        };
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.parentElement!.closest('bdi')) {
            flush();
            continue;
          }
          const t = n.nodeValue ?? '';
          for (let i = 0; i < t.length; i++) {
            if (/\s/.test(t[i])) {
              flush();
              continue;
            }
            const range = document.createRange();
            range.setStart(n, i);
            range.setEnd(n, i + 1);
            const r = [...range.getClientRects()].find((x) => x.width > 0);
            if (r) {
              word.push(Math.round(r.top + r.height / 2));
              letters += t[i];
            }
          }
        }
        flush();
      }
    }
    return out;
  });
}

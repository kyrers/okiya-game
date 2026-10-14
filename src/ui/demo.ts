/**
 * Watch a game: a whole game played by the engine, in a sheet, slowly enough to read. The garden is
 * the game's own (the tiles the player to move may take are lifted, the last taken tile is marked,
 * tokens are set down and the taken tile flies off as in play, the brush goes through a winning
 * formation), on a piece of the table's cloth whose lit half is the player to move. A line above it
 * says what just happened and what the other player may take now.
 *
 * Timers only, one at a time; nothing while the tab is hidden, and nothing at all once the sheet is
 * closed. Under reduced motion (the system's or the app's setting) it waits for Next, and no tile flies.
 */
import { tactics } from '../engine/ai';
import { applyMove, legalMoves, newGame, opponent, type GameState, type Player, type Tile } from '../engine/garden';
import { icon, ringDiagram, tokenSvg } from './art';
import { BoardView, flyTile } from './board';
import { symGlyph, tileSvg, vegGlyph } from './tileArt';
import { glyphWords, reasonWords, SYM_WORD, VEG_WORD } from './words';

const NAME: Record<Player, string> = { 1: 'Vermilion', 2: 'Indigo' };
/** A fresh deal is looked at a little longer before the first move. */
const FIRST_MS = 2600;
/** From one move to the next: time to read the line and find the lifted tiles. */
const MOVE_MS = 2800;
/** After Play, the next move comes a little sooner than a full beat. */
const RESUME_MS = 1200;
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export interface Plan {
  readonly start: GameState;
  readonly moves: readonly number[];
}

/**
 * A whole game, chosen ahead with the engine: each side takes a winning tile when it has one,
 * otherwise avoids handing the other a win, otherwise takes any tile the rules allow. A deal that
 * ends in a block, a tie or a short game is dealt again (a few times at most), so a demonstration
 * nearly always ends with a brush stroke through a formation.
 */
export function demoPlan(rng: () => number = Math.random): Plan {
  let plan: Plan | null = null;
  for (let tries = 0; tries < 16; tries++) {
    const start = newGame(Math.floor(rng() * 2 ** 31), rng() < 0.5 ? 1 : 2);
    const moves: number[] = [];
    let s = start;
    while (!s.result) {
      const t = tactics(s);
      let pool = t.moves.filter((_, k) => t.wins[k]);
      if (!pool.length) pool = t.moves.filter((_, k) => !t.losesNext[k]);
      if (!pool.length) pool = t.moves;
      const m = pool[Math.floor(rng() * pool.length)];
      moves.push(m);
      s = applyMove(s, m);
    }
    plan = { start, moves };
    if (s.result.cells.length > 0 && moves.length >= 9) break;
  }
  return plan!;
}

function calm(): boolean {
  return document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Said {
  tile: string;
  what: string;
  next: string;
  /** The same two sentences, in plain words, for screen readers. */
  text: string;
}

function who(p: Player): string {
  return `<span class="demo-who"><span class="inline-chip">${tokenSvg(p)}</span>${NAME[p]}</span>`;
}

function took(t: Tile): string {
  return `${glyphWords(vegGlyph(t.veg), VEG_WORD[t.veg])} with ${glyphWords(symGlyph(t.sym), SYM_WORD[t.sym])}`;
}

function lifted(n: number): string {
  return n === 1 ? 'the one lifted tile' : `the ${COUNT[n] ?? n} lifted ones`;
}

/** What the line says about a position: the move that led to it, and what may be taken now. */
export function narrate(state: GameState): Said {
  const last = state.history[state.history.length - 1];
  const r = state.result;
  if (!last) {
    const n = legalMoves(state).length;
    return {
      tile: `<span class="say-tile ring">${ringDiagram()}</span>`,
      what: `A fresh garden. ${who(state.current)} opens.`,
      next: `The first tile must come from the <b>outer ring</b>: ${lifted(n)}.`,
      text: `A fresh garden. ${NAME[state.current]} opens. The first tile must come from the outer ring: ${lifted(n)}.`,
    };
  }
  const t = last.tile;
  const mover = last.player;
  const tile = `<span class="say-tile">${tileSvg(t)}</span>`;
  const what = `${who(mover)} took ${took(t)}.`;
  const whatText = `${NAME[mover]} took ${VEG_WORD[t.veg]} with ${SYM_WORD[t.sym]}.`;
  if (r) {
    if (r.winner === null) {
      const end = reasonWords('full', '');
      return { tile, what, next: `<b class="demo-end">A tie</b>: ${lower(end)}.`, text: `${whatText} A tie: ${lower(end)}.` };
    }
    const why = reasonWords(r.reason, NAME[opponent(r.winner)]);
    const reason = r.reason === 'blocked' ? why : lower(why);
    return {
      tile,
      what,
      next: `${who(r.winner)} <b class="demo-end">wins</b>: ${reason}.`,
      text: `${whatText} ${NAME[r.winner]} wins: ${reason}.`,
    };
  }
  const n = legalMoves(state).length;
  const other = state.current;
  return {
    tile,
    what,
    next: `${who(other)} may now take any ${glyphWords(vegGlyph(t.veg), VEG_WORD[t.veg])} or any ${glyphWords(symGlyph(t.sym), SYM_WORD[t.sym])} tile: ${lifted(n)}.`,
    text: `${whatText} ${NAME[other]} may now take any ${VEG_WORD[t.veg]} or any ${SYM_WORD[t.sym]} tile: ${lifted(n)}.`,
  };
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export class Demo {
  /** The sheet's content: the line, the garden on its cloth, the controls. */
  readonly el: HTMLElement;
  private readonly view: BoardView;
  private readonly stage: HTMLElement;
  private readonly say: HTMLElement;
  private readonly live: HTMLElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly againBtn: HTMLButtonElement;
  private plan: Plan = demoPlan();
  private state: GameState = this.plan.start;
  private timer = 0;
  private liveTimer = 0;
  /** The viewer wants it to play on by itself (Pause turns this off). */
  private playing = false;
  private destroyed = false;
  private readonly onVisibility = () => (document.visibilityState === 'hidden' ? this.stopClock() : this.schedule(RESUME_MS));
  private readonly onResize = () => this.fit();

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'demo';
    this.el.innerHTML = `
      <div class="demo-say"><div class="demo-tile"></div><div class="demo-lines"><p class="demo-what"></p><p class="demo-next"></p></div></div>
      <p class="sr-only" aria-live="polite" aria-atomic="true"></p>
      <div class="demo-stage"></div>
      <div class="demo-controls">
        <button type="button" class="btn ghost" data-demo="toggle"></button>
        <button type="button" class="btn ghost" data-demo="next">${icon('next')} Next move</button>
        <button type="button" class="btn primary" data-demo="again" hidden>${icon('restart')} Play again</button>
      </div>`;
    this.say = this.el.querySelector('.demo-say')!;
    this.live = this.el.querySelector('[aria-live]')!;
    this.stage = this.el.querySelector('.demo-stage')!;
    this.toggleBtn = this.el.querySelector('[data-demo="toggle"]')!;
    this.nextBtn = this.el.querySelector('[data-demo="next"]')!;
    this.againBtn = this.el.querySelector('[data-demo="again"]')!;
    this.view = new BoardView({ onTake: () => undefined, onDenied: () => undefined }, 'The garden of the game being shown');
    // A game to watch, not to play: nothing in the garden can be focused or pressed; the line above
    // it says what is happening, for everyone.
    this.view.el.inert = true;
    this.view.el.setAttribute('aria-hidden', 'true');
    this.view.el.querySelectorAll('button').forEach((b) => (b.tabIndex = -1));
    this.stage.append(this.view.el);
    this.el.addEventListener('click', (ev) => {
      const act = (ev.target as Element).closest<HTMLElement>('[data-demo]')?.dataset.demo;
      if (act === 'toggle') this.setPlaying(!this.playing);
      else if (act === 'next') this.next();
      else if (act === 'again') this.again();
    });
  }

  /** Call once the sheet is open: sizes the garden, shows the deal and (motion allowing) plays. */
  start(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('resize', this.onResize);
    void document.fonts?.ready.then(() => this.fit());
    this.paint(null, false);
    this.fit();
    this.setPlaying(!calm(), FIRST_MS);
  }

  /** Stops everything: no timer, no listener, no tile in the air. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    this.stopClock();
    window.clearTimeout(this.liveTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    this.el.closest('dialog')?.querySelectorAll('.flyer').forEach((f) => f.getAnimations().forEach((a) => a.cancel()));
    this.view.destroy();
  }

  /* ---------- the clock ---------- */

  private stopClock(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private schedule(ms: number): void {
    this.stopClock();
    if (this.destroyed || !this.playing || this.state.result || document.visibilityState === 'hidden') return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (!this.el.isConnected) return this.destroy();
      this.step();
      this.schedule(MOVE_MS);
    }, ms);
  }

  private setPlaying(on: boolean, delay = RESUME_MS): void {
    this.playing = on;
    this.controls();
    if (on) this.schedule(delay);
    else this.stopClock();
  }

  /* ---------- moves ---------- */

  private next(): void {
    if (this.state.result) return;
    this.step();
    this.schedule(MOVE_MS);
  }

  private again(): void {
    this.plan = demoPlan();
    this.state = this.plan.start;
    this.paint(null, false);
    this.setPlaying(!calm(), FIRST_MS);
    // The button pressed is gone: keep the keyboard in the sheet, on the first control.
    if (this.el.contains(document.activeElement) || document.activeElement === document.body) {
      (calm() ? this.nextBtn : this.toggleBtn).focus({ preventScroll: true });
    }
  }

  private step(): void {
    const index = this.plan.moves[this.state.history.length];
    if (index === undefined || this.state.result) return;
    const cell = this.state.board[index];
    if (cell.kind !== 'tile') return;
    const from = this.view.cell(index).getBoundingClientRect();
    this.state = applyMove(this.state, index);
    const moving = !calm();
    this.paint(index, moving);
    const host = this.el.closest('dialog');
    if (moving && host && from.width > 0) void flyTile(from, cell.tile, this.say.querySelector('.say-tile'), host);
    if (this.state.result) {
      this.playing = false;
      this.stopClock();
      this.controls();
    }
  }

  /* ---------- drawing ---------- */

  private paint(placed: number | null, animate: boolean): void {
    const s = this.state;
    const last = s.history[s.history.length - 1];
    this.view.render({
      state: s,
      legal: new Set(s.result ? [] : legalMoves(s)),
      showLegal: true,
      lastIndex: last ? last.index : null,
      justPlaced: animate ? placed : null,
      names: [NAME[1], NAME[2]],
    });
    const r = s.result;
    this.stage.dataset.turn = r ? (r.winner ? String(r.winner) : 'tie') : String(s.current);
    this.stage.classList.toggle('over', !!r);
    const said = narrate(s);
    this.say.querySelector('.demo-tile')!.innerHTML = said.tile;
    this.say.querySelector('.demo-what')!.innerHTML = said.what;
    this.say.querySelector('.demo-next')!.innerHTML = said.next;
    this.el.dataset.move = String(s.history.length);
    // Read out politely: cleared, then set, so the same words twice are still heard.
    this.live.textContent = '';
    window.clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => {
      if (!this.destroyed) this.live.textContent = said.text;
    }, 30);
    this.controls();
  }

  private controls(): void {
    const over = !!this.state.result;
    const hadFocus = this.el.contains(document.activeElement) && (document.activeElement === this.toggleBtn || document.activeElement === this.nextBtn);
    this.toggleBtn.hidden = over;
    this.nextBtn.hidden = over;
    this.againBtn.hidden = !over;
    this.toggleBtn.innerHTML = this.playing ? `${icon('pause')} Pause` : `${icon('play')} Play`;
    if (over && hadFocus) this.againBtn.focus({ preventScroll: true });
  }

  /**
   * The garden takes the room the sheet has left: under the line and above the controls (or beside
   * them on a phone held sideways). The line keeps the height of its longest sentence at this
   * width, so the garden holds its size through a whole game.
   */
  private fit(): void {
    if (this.destroyed || !this.el.isConnected) return;
    const body = this.el.parentElement;
    const panel = this.el.closest<HTMLElement>('.sheet-panel');
    if (!body || !panel) return;
    const side = matchMedia('(max-height: 520px) and (min-aspect-ratio: 5/4)').matches;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const maxH = Math.min(parseFloat(getComputedStyle(panel).maxHeight) || vh, vh);
    const head = panel.querySelector<HTMLElement>('.sheet-head')!.offsetHeight;
    const bcs = getComputedStyle(body);
    const padY = parseFloat(bcs.paddingTop) + parseFloat(bcs.paddingBottom);
    const width = body.clientWidth - parseFloat(bcs.paddingLeft) - parseFloat(bcs.paddingRight);
    const gap = parseFloat(getComputedStyle(this.el).rowGap) || 0;
    const colGap = parseFloat(getComputedStyle(this.el).columnGap) || 0;
    const ring = 2 * (parseFloat(getComputedStyle(this.stage).paddingTop) || 0);
    const controls = (this.el.querySelector<HTMLElement>('.demo-controls')!.offsetHeight || 48);
    let board: number;
    if (side) {
      // The garden at the left, as tall as the sheet allows; the line and controls beside it.
      board = Math.min(maxH - head - padY - ring, (width - colGap) * 0.56 - ring);
      this.el.style.setProperty('--demo-board', `${Math.floor(Math.max(150, board))}px`);
      this.reserveLine();
    } else {
      this.reserveLine();
      const line = this.say.offsetHeight;
      board = Math.min(width - ring, maxH - head - padY - line - controls - 2 * gap - ring, 560);
      this.el.style.setProperty('--demo-board', `${Math.floor(Math.max(150, board))}px`);
    }
  }

  /** Sets the line's height to the tallest it can be in a game, at its current width. */
  private reserveLine(): void {
    const what = this.say.querySelector<HTMLElement>('.demo-what')!;
    const next = this.say.querySelector<HTMLElement>('.demo-next')!;
    const keep = [what.innerHTML, next.innerHTML];
    this.say.style.minHeight = '';
    const long: Tile = { veg: 'cherry', sym: 'sun' };
    const samples: [string, string][] = [
      [`${who(1)} took ${took(long)}.`, `${who(1)} may now take any ${glyphWords(vegGlyph('cherry'), 'cherry')} or any ${glyphWords(symGlyph('sun'), 'rising sun')} tile: the seven lifted ones.`],
      [`A fresh garden. ${who(1)} opens.`, `The first tile must come from the <b>outer ring</b>: the twelve lifted ones.`],
      [`${who(1)} took ${took(long)}.`, `${who(2)} <b class="demo-end">wins</b>: Vermilion has no tile to take.`],
    ];
    let tallest = 0;
    for (const [w, n] of samples) {
      what.innerHTML = w;
      next.innerHTML = n;
      tallest = Math.max(tallest, this.say.offsetHeight);
    }
    [what.innerHTML, next.innerHTML] = keep;
    this.say.style.minHeight = `${Math.ceil(tallest)}px`;
  }
}

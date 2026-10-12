/**
 * The game screen: two halves, one per player, with the garden on the seam. The half of the player
 * to move is lit. Owns the turn flow: the person's taps, the computer's moves, undo, the end of a
 * game and of a match.
 */
import {
  TOKENS_PER_PLAYER,
  applyMove,
  legalMoves,
  newGameFromTiles,
  opponent,
  pointsTarget,
  tokensInHand,
  type GameResult,
  type Player,
  type Tile,
} from '../engine/okiya';
import { computerMove } from '../game/aiClient';
import { COMPUTER_SEAT, HUMAN_SEAT, isComputer, nextGame, play, startMatch, undo, type MatchView } from '../game/match';
import { icon, tokenSvg } from './art';
import { BoardView } from './board';
import { motionReduced, type Settings } from './prefs';
import { soundDenied, soundEnd, soundLift, soundPlace } from './sound';
import { tileLabel, tileSvg } from './tileArt';
import { DIFFICULTY_WORD, MODE_SHORT, MODE_WORD, orderHtml, orderText, possessive, reasonWords, tileWords, verb } from './words';

export interface GameScreenDeps {
  settings(): Settings;
  save(view: MatchView): void;
  openMenu(): void;
  goHome(): void;
}

/** The computer never answers faster than this, so its move can be followed. */
const MIN_THINK_MS = 700;
/**
 * After a move, taps are ignored this long: enough to swallow an accidental double tap (which in
 * a two-player game could take a tile for the other player), short enough not to be noticed.
 */
const TAP_GUARD_MS = 260;

export class GameScreen {
  readonly el: HTMLElement;
  private view: MatchView;
  private readonly board: BoardView;
  private readonly seats: Record<Player, HTMLElement>;
  private readonly label: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly live: HTMLElement;
  private animating = false;
  private thinking = false;
  private guardUntil = 0;
  /** Bumped whenever a pending computer move must be ignored (undo, new game, leaving). */
  private generation = 0;
  private lastIndex: number | null = null;
  private destroyed = false;
  private deniedTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private contentObserver: ResizeObserver | null = null;
  private fitPending = false;
  private fitSize = '';
  private readonly fitStore = new Map<string, { level: number; room: number; maxRoom: number; lastRoom: number }>();
  private onFonts: (() => void) | null = null;
  private deniedIndex: number | null = null;

  constructor(view: MatchView, private readonly deps: GameScreenDeps) {
    this.view = view;
    this.el = document.createElement('main');
    this.el.className = 'screen game';
    this.el.innerHTML = `
      <div class="glow glow-1" aria-hidden="true"></div>
      <div class="glow glow-2" aria-hidden="true"></div>
      <header class="topbar">
        <p class="match-label"></p>
        <div class="topbar-actions">
          <button type="button" class="icon-btn undo-btn" aria-label="Undo">${icon('undo')}</button>
          <button type="button" class="icon-btn menu-btn" aria-label="Menu" aria-haspopup="dialog">${icon('menu')}</button>
        </div>
      </header>
      <section class="seat seat-2" aria-label="Indigo seat"></section>
      <div class="seam"></div>
      <section class="seat seat-1" aria-label="Vermilion seat"></section>
      <p class="sr-only" aria-live="polite" aria-atomic="true"></p>`;
    this.label = this.el.querySelector('.match-label')!;
    this.undoBtn = this.el.querySelector('.undo-btn')!;
    this.live = this.el.querySelector('[aria-live]')!;
    this.seats = { 1: this.el.querySelector('.seat-1')!, 2: this.el.querySelector('.seat-2')! };
    this.board = new BoardView({ onTake: (i) => this.humanTake(i), onDenied: (i) => this.denied(i) });
    this.el.querySelector('.seam')!.append(this.board.el);
    this.undoBtn.addEventListener('click', () => this.undo());
    this.el.querySelector('.menu-btn')!.addEventListener('click', () => this.deps.openMenu());
    this.el.addEventListener('click', (ev) => {
      const action = (ev.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'next') this.next();
      else if (action === 'again') this.again();
      else if (action === 'home') this.deps.goHome();
    });
    const last = this.view.game.history[this.view.game.history.length - 1];
    this.lastIndex = last ? last.index : null;
    this.render(null);
    this.announceTurn();
    this.maybeComputer();
    // Refit the seats whenever the screen changes size (rotation, browser bars), when a seat's
    // content changes size (text reflowing), and when any font finishes loading.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitSeats());
      this.resizeObserver.observe(this.el);
      this.contentObserver = new ResizeObserver(() => this.refitSoon());
      this.observeSeatContent();
    }
    this.onFonts = () => {
      if (this.destroyed) return;
      // New metrics: measure again from the start, on the next frame. WebKit fires font events in
      // the middle of a style update, where measuring returns the layout from before any change.
      this.fitStore.clear();
      this.refitSoon();
    };
    document.fonts?.addEventListener('loadingdone', this.onFonts);
    void document.fonts?.ready.then(this.onFonts);
  }

  /** The current match, for saving and the menu. */
  get match(): MatchView {
    return this.view;
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    window.clearTimeout(this.deniedTimer);
    this.resizeObserver?.disconnect();
    this.contentObserver?.disconnect();
    if (this.onFonts) document.fonts?.removeEventListener('loadingdone', this.onFonts);
  }

  private refitSoon(): void {
    if (this.fitPending) return;
    this.fitPending = true;
    requestAnimationFrame(() => {
      this.fitPending = false;
      if (!this.destroyed) this.fitSeats();
    });
  }

  private observeSeatContent(): void {
    if (!this.contentObserver) return;
    this.contentObserver.disconnect();
    for (const p of [1, 2] as const) for (const part of this.seats[p].children) this.contentObserver.observe(part);
  }

  /** Re-read settings (playable-tile marking) after they change. */
  refresh(): void {
    this.render(null);
  }

  focusBoard(): void {
    this.board.focusFirstLegal();
  }

  get canUndo(): boolean {
    return this.setup.opponent === 'computer' && !this.animating && undo(this.view, this.undoSeat()) !== null;
  }

  get hasUndo(): boolean {
    return this.setup.opponent === 'computer';
  }

  undo(): void {
    if (!this.hasUndo || this.animating) return;
    const u = undo(this.view, this.undoSeat());
    if (!u) return;
    this.generation++;
    this.thinking = false;
    this.view = u;
    this.deps.save(u);
    const last = u.game.history[u.game.history.length - 1];
    this.lastIndex = last ? last.index : null;
    this.render(null);
    this.say(`Move taken back. ${this.turnSentence()}`);
    this.maybeComputer();
  }

  /** Start the next game of the match (the loser opens). */
  next(): void {
    if (!this.view.game.result || this.view.match.over) return;
    this.generation++;
    this.view = nextGame(this.view);
    this.deps.save(this.view);
    this.lastIndex = null;
    this.render(null);
    this.announceTurn();
    this.focusAfterChange();
    this.maybeComputer();
  }

  /** A new match with the same setup. */
  again(): void {
    this.generation++;
    this.view = startMatch(this.view.saved.setup);
    this.deps.save(this.view);
    this.lastIndex = null;
    this.thinking = false;
    this.render(null);
    this.announceTurn();
    this.focusAfterChange();
    this.maybeComputer();
  }

  /* ---------- turn flow ---------- */

  private get setup() {
    return this.view.saved.setup;
  }

  private undoSeat(): Player | null {
    return this.setup.opponent === 'computer' ? HUMAN_SEAT : null;
  }

  private humanCanMove(): boolean {
    const g = this.view.game;
    return !g.result && !this.thinking && performance.now() >= this.guardUntil && !isComputer(this.setup, g.current);
  }

  private humanTake(index: number): void {
    if (!this.humanCanMove()) return;
    void this.applyMove(index).then(() => this.maybeComputer());
  }

  private denied(index: number): void {
    if (!this.humanCanMove()) return;
    soundDenied();
    const cell = this.board.cell(index);
    cell.classList.remove('nope');
    void cell.offsetWidth;
    cell.classList.add('nope');
    const g = this.view.game;
    const c = g.board[index];
    if (c.kind !== 'tile') return;
    this.deniedIndex = index;
    window.clearTimeout(this.deniedTimer);
    this.deniedTimer = window.setTimeout(() => {
      this.deniedIndex = null;
      this.renderSeats();
    }, 2600);
    this.renderSeats();
    this.say(g.lastTile ? `${tileLabel(c.tile)} shares nothing with ${tileLabel(g.lastTile)}.` : `The first tile must come from the outer ring.`);
  }

  private maybeComputer(): void {
    const g = this.view.game;
    if (this.destroyed || g.result || !isComputer(this.setup, g.current) || this.thinking) return;
    const gen = this.generation;
    this.thinking = true;
    this.renderSeats();
    const started = performance.now();
    void computerMove(g, this.setup.difficulty).then((index) => {
      const wait = Math.max(0, MIN_THINK_MS - (performance.now() - started));
      window.setTimeout(() => {
        if (gen !== this.generation || this.destroyed) return;
        this.thinking = false;
        if (!legalMoves(this.view.game).includes(index)) return this.maybeComputer();
        void this.applyMove(index).then(() => this.focusAfterChange());
      }, wait);
    });
  }

  private async applyMove(index: number): Promise<void> {
    const before = this.view.game;
    const cell = before.board[index];
    if (cell.kind !== 'tile') return;
    const mover = before.current;
    const from = this.board.cell(index).getBoundingClientRect();
    this.animating = true;
    // The double-tap guard follows a person's own move only: after the computer's move the
    // player may answer at once.
    if (!isComputer(this.setup, mover)) {
      this.guardUntil = performance.now() + TAP_GUARD_MS;
      this.el.dataset.busy = '';
      window.setTimeout(() => {
        if (performance.now() >= this.guardUntil - 1) delete this.el.dataset.busy;
      }, TAP_GUARD_MS);
    }
    this.view = play(this.view, index);
    this.deps.save(this.view);
    this.lastIndex = index;
    this.deniedIndex = null;
    soundLift();
    this.render(index);
    window.setTimeout(soundPlace, 90);
    const g = this.view.game;
    const name = this.setup.names[mover - 1];
    if (g.result) {
      this.say(`${name} took ${tileWords(cell.tile)}. ${this.resultSentence(g.result)}`);
    } else {
      this.say(`${name} took ${tileWords(cell.tile)}. ${this.turnSentence()}`);
    }
    const slot = this.el.querySelector<HTMLElement>('.seat.moving .say-tile');
    await this.fly(from, cell.tile, slot);
    this.animating = false;
    this.updateUndo();
    if (g.result) this.gameOver(g.result);
  }

  private gameOver(r: GameResult): void {
    const vsComputer = this.setup.opponent === 'computer';
    if (r.winner === null) soundEnd('tie');
    else if (vsComputer) soundEnd(r.winner === HUMAN_SEAT ? 'win' : 'loss');
    else soundEnd('win');
    this.focusAfterChange();
  }

  /** After a game ends or a new one starts, put keyboard focus somewhere useful. */
  private focusAfterChange(): void {
    if (this.destroyed || !this.el.isConnected) return;
    const active = document.activeElement;
    const inDialog = active?.closest('dialog');
    if (inDialog) return;
    const btn = this.el.querySelector<HTMLButtonElement>('.seat [data-action]');
    if (btn) {
      if (active === document.body || this.el.contains(active)) btn.focus({ preventScroll: true });
      return;
    }
    if (this.el.contains(active) && !(active as HTMLElement).closest('.cell')) return;
    if (this.el.contains(active)) this.board.focusFirstLegal();
  }

  /** The taken tile lifts out of the garden and lands where the next player reads it. */
  private fly(from: DOMRect, tile: Tile, target: HTMLElement | null): Promise<void> {
    if (motionReduced(this.deps.settings()) || from.width === 0) return Promise.resolve();
    const fly = document.createElement('div');
    fly.className = 'flyer';
    fly.innerHTML = tileSvg(tile);
    Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(fly);
    let frames: Keyframe[];
    if (target && target.getBoundingClientRect().width > 0) {
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const sc = to.width / from.width;
      target.style.visibility = 'hidden';
      frames = [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', boxShadow: '0 2px 4px rgba(0,0,0,.2)' },
        { transform: 'translate(0,-8px) scale(1.08) rotate(-2deg)', boxShadow: '0 18px 30px rgba(0,0,0,.35)', offset: 0.22 },
        { transform: `translate(${dx}px,${dy}px) scale(${sc}) rotate(0deg)`, boxShadow: '0 2px 4px rgba(0,0,0,.25)' },
      ];
    } else {
      frames = [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(0,-14px) scale(1.08)', opacity: 0 },
      ];
    }
    const anim = fly.animate(frames, { duration: target ? 520 : 360, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'forwards' });
    return new Promise((resolve) => {
      const done = () => {
        fly.remove();
        if (target) target.style.visibility = '';
        resolve();
      };
      anim.onfinish = done;
      anim.oncancel = done;
      window.setTimeout(done, 900); // never leave the board locked
    });
  }

  /* ---------- rendering ---------- */

  private render(justPlaced: number | null): void {
    const g = this.view.game;
    const humanMoves = !g.result && !isComputer(this.setup, g.current);
    const legal = new Set(humanMoves && !this.thinking ? legalMoves(g) : []);
    this.el.dataset.turn = g.result ? (g.result.winner ? String(g.result.winner) : 'tie') : String(g.current);
    this.el.classList.toggle('is-over', !!g.result);
    this.board.render({
      state: g,
      legal,
      showLegal: this.deps.settings().showPlayable,
      lastIndex: this.lastIndex,
      justPlaced,
      names: this.setup.names,
    });
    const m = this.view.match;
    const parts = [`Game ${this.view.gameNumber}`, `<span class="long">${MODE_WORD[this.setup.mode]}</span><span class="short">${MODE_SHORT[this.setup.mode]}</span>`];
    if (this.setup.opponent === 'computer') parts.push(DIFFICULTY_WORD[this.setup.difficulty]);
    if (m.ties > 0 && this.setup.mode !== 'single') parts.push(`${m.ties} ${m.ties === 1 ? 'tie' : 'ties'}`);
    this.label.innerHTML = parts.join(' · ');
    this.renderSeats();
    this.updateUndo();
  }

  private updateUndo(): void {
    // Undo is for play against the computer only: between two people at one screen, as at the
    // table, a tile taken stays taken.
    const can = !this.animating && undo(this.view, this.undoSeat()) !== null;
    this.undoBtn.disabled = !can;
    this.undoBtn.hidden = this.setup.opponent !== 'computer' || !!this.view.game.result;
  }

  private renderSeats(): void {
    for (const p of [1, 2] as const) this.renderSeat(p);
    this.observeSeatContent();
    this.fitSeats();
  }

  /**
   * The seats never let their content spill, and never drop what a player needs to read. When a
   * seat does not fit the room the layout gives it, both seats step together: (1) the row of small
   * tokens becomes a count; (2) the seats take a little room from the garden, at most a tenth of
   * it; (3) the type steps down a size, and the seats may take up to 15% of the garden; (4) only as
   * a last resort, which the size sweep proves no tested screen reaches, the opener's note is left
   * out. Names shrink to fit, then wrap, before
   * any of this. The steps reached are remembered per screen size and per phase (playing, over),
   * and only ever go up, so the garden keeps its size for a whole game.
   */
  private fitSeats(): void {
    const size = `${innerWidth}x${innerHeight}`;
    if (size !== this.fitSize) {
      this.fitSize = size;
      this.fitStore.clear();
    }
    const key = this.view.game.result ? 'over' : 'playing';
    const fit = this.fitStore.get(key) ?? { level: 0, room: 0, maxRoom: -1, lastRoom: -1 };
    this.applyFit(fit);
    if (fit.maxRoom < 0) {
      // A tenth of the garden as it is with no extra room (15% as a last resort, before a note
      // would be left out), measured once; and never so much that a tile drops under 44 px, a
      // finger's width (a tile is 22% of the garden).
      this.el.style.setProperty('--seat-room', '0px');
      const garden = this.board.el.getBoundingClientRect().width;
      const floor = (garden - 44 / 0.22) / 2;
      fit.maxRoom = Math.max(0, Math.floor(Math.min(garden * 0.1, floor)));
      fit.lastRoom = Math.max(0, Math.floor(Math.min(garden * 0.15, floor)));
      this.applyFit(fit);
    }
    const spill = () => spills(this.seats[1]) || spills(this.seats[2]);
    if (fit.level < 1 && spill()) {
      fit.level = 1;
      this.applyFit(fit);
    }
    while (fit.level === 1 && spill() && fit.room < fit.maxRoom) {
      fit.room = Math.min(fit.maxRoom, fit.room + 6);
      this.applyFit(fit);
    }
    if (fit.level < 2 && spill()) {
      fit.level = 2;
      this.applyFit(fit);
    }
    while (fit.level === 2 && spill() && fit.room < fit.lastRoom) {
      fit.room = Math.min(fit.lastRoom, fit.room + 4);
      this.applyFit(fit);
    }
    if (fit.level < 3 && spill()) {
      fit.level = 3;
      this.applyFit(fit);
    }
    this.fitStore.set(key, fit);
  }

  private applyFit(fit: { level: number; room: number }): void {
    for (const n of [1, 2, 3]) this.el.classList.toggle(`fit-${n}`, fit.level >= n);
    this.el.style.setProperty('--seat-room', `${fit.room}px`);
    this.fitNames(fit.level);
  }

  /**
   * Both names at one size, whole, by one rule: the name shares its line with the token count and
   * the score down to 80% (58% in tight seats); then the count and score go to the line below and
   * the name has the line to itself, down to 58%; then it wraps onto two lines, breaking inside a
   * word if it must, and finally three. Only a name that fits none of these would be cut short; the
   * sweep shows none is.
   */
  private fitNames(level: number): void {
    const names = [1, 2].map((p) => this.seats[p as Player].querySelector<HTMLElement>('.seat-name')).filter((n): n is HTMLElement => !!n);
    // Measured with the clamp lifted, where the name is laid out in full: a clamped box in Chromium
    // draws an ellipsis while reporting neither a scroll overflow nor text past its edge. Too wide
    // (with a pixel to spare: text widths differ by fractions from one screen to another), or more
    // lines than the box shows.
    const over = () => {
      const allowed = names.map((n) => {
        const cs = getComputedStyle(n);
        const clamp = parseInt(cs.getPropertyValue('-webkit-line-clamp'), 10);
        return cs.whiteSpace === 'nowrap' ? 1 : Number.isFinite(clamp) ? clamp : 1;
      });
      this.el.classList.add('names-measuring');
      const result = names.some((n, i) => {
        const cs = getComputedStyle(n);
        const b = n.getBoundingClientRect();
        const left = b.left + parseFloat(cs.paddingLeft);
        const right = b.right - parseFloat(cs.paddingRight);
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        const lines = new Set(rects.map((r) => Math.round(r.top))).size;
        // A line past either edge (a right-to-left name overflows on the left), or within a pixel
        // of the whole width.
        return lines > allowed[i] || rects.some((r) => r.right > right || r.left < left || r.width > right - left - 1);
      });
      this.el.classList.remove('names-measuring');
      return result;
    };
    // Tight seats (the type has already stepped down) cannot spare a line for the count and
    // score: the name shrinks further beside them first.
    const shared: number[] = level >= 2 ? [1, 0.9, 0.8, 0.72, 0.64, 0.58] : [1, 0.9, 0.8];
    const steps: [string, number][] = [
      ...shared.map((k): [string, number] => ['', k]),
      ['ids-stacked', 1], ['ids-stacked', 0.9], ['ids-stacked', 0.8], ['ids-stacked', 0.72], ['ids-stacked', 0.64], ['ids-stacked', 0.58],
      ['ids-stacked names-wrap', 0.72], ['ids-stacked names-wrap', 0.64], ['ids-stacked names-wrap', 0.58],
      ['ids-stacked names-wrap names-wrap-3', 0.58],
    ];
    for (const [cls, scale] of steps) {
      this.el.classList.remove('ids-stacked', 'names-wrap', 'names-wrap-3');
      if (cls) this.el.classList.add(...cls.split(' '));
      this.el.style.setProperty('--name-scale', String(scale));
      if (!over()) return;
    }
  }


  private renderSeat(p: Player): void {
    const el = this.seats[p];
    const g = this.view.game;
    const setup = this.setup;
    const name = setup.names[p - 1];
    const r = g.result;
    const moving = !r && g.current === p;
    let state = moving ? 'moving' : 'waiting';
    if (r) state = r.winner === null ? 'tie' : r.winner === p ? 'won' : 'lost';
    el.className = `seat seat-${p} ${state}`;
    el.setAttribute('aria-label', `${name}${setup.opponent === 'computer' && p === COMPUTER_SEAT ? `, ${DIFFICULTY_WORD[setup.difficulty]}` : ''}`);
    const left = tokensInHand(g, p);
    // The tokens still in hand, drawn as small copies of the player's own token.
    const pips = Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => (i < left ? tokenSvg(p, 'pip') : '<i class="pip used"></i>')).join('');
    const idLine = `
      <div class="seat-id">
        <span class="seat-chip">${tokenSvg(p)}</span>
        <h2 class="seat-name" dir="auto">${escape(name)}</h2>
        <i class="seat-break" aria-hidden="true"></i>
        <span class="seat-count" aria-hidden="true">${left}<span class="seat-count-of">/${TOKENS_PER_PLAYER}</span></span>
        ${this.scoreHtml(p)}
      </div>
      <div class="seat-pips" role="img" aria-label="${left} of ${TOKENS_PER_PLAYER} tokens left">${pips}</div>`;
    el.innerHTML = idLine + `<div class="seat-say">${this.sayHtml(p, state)}</div>`;
  }

  private scoreHtml(p: Player): string {
    const m = this.view.match;
    const mode = this.setup.mode;
    if (mode === 'single') return '';
    if (mode === 'sets3') {
      // Won games are gold seals, square like a stamp: nothing like the round tokens.
      const seals = [0, 1, 2].map((i) => `<i class="seal${i < m.wins[p] ? ' won' : ''}"></i>`).join('');
      return `<span class="seat-score" role="img" aria-label="${m.wins[p]} of 3 wins">${seals}</span>`;
    }
    const target = pointsTarget(mode);
    return `<span class="seat-score points" aria-label="${m.points[p]} of ${target} points"><b>${m.points[p]}</b><span>/${target}</span></span>`;
  }

  private sayHtml(p: Player, state: string): string {
    const g = this.view.game;
    const setup = this.setup;
    const name = setup.names[p - 1];
    const computer = isComputer(setup, p);
    if (state === 'moving') {
      // A refused tap rewrites the card's own line for a moment ("Not that tile: …") instead of
      // adding one, so the seat never grows; the tile shakes, and screen readers hear the reason.
      const denied = this.deniedIndex !== null && !computer;
      const nope = `<b class="nope-word">Not that tile</b>: `;
      if (!g.lastTile) {
        // The name is just above the card, so the card speaks to the player, as on later turns.
        const what = computer
          ? `The computer opens<span class="dots" aria-hidden="true"></span>`
          : denied
            ? `${nope}take any tile on the <b>outer ring</b>`
            : `Take any tile on the <b>outer ring</b>`;
        return `<div class="say-order${computer ? ' thinking' : ''}">
            <span class="say-tile ring" aria-hidden="true">${ringIcon()}</span>
            <p class="say-what">${what}</p>
          </div>
          <p class="say-note">${this.openerNote()}</p>`;
      }
      const opp = setup.names[opponent(p) - 1];
      const order = orderHtml(g.lastTile);
      const what = computer
        ? `The computer is thinking<span class="dots" aria-hidden="true"></span>`
        : denied
          ? `${nope}${order.replace(/^Take/, 'take')}`
          : order;
      return `<div class="say-order${computer ? ' thinking' : ''}">
          <span class="say-tile" role="img" aria-label="${escape(opp)} took ${tileLabel(g.lastTile)}">${tileSvg(g.lastTile)}</span>
          <p class="say-what">${what}</p>
        </div>`;
    }
    if (state === 'waiting') {
      return `<p class="say-wait">${computer ? 'Waiting' : verb(name, 'Waiting for your turn', 'Waiting')}</p>`;
    }
    const r = g.result!;
    const m = this.view.match;
    const matchOver = m.over && setup.mode !== 'single';
    const loserName = r.winner ? setup.names[opponent(r.winner) - 1] : '';
    let result = '';
    let reason = '';
    let quiet = false;
    if (state === 'won') {
      result = matchOver ? verb(name, 'You win the match', 'Wins the match') : verb(name, 'You win', 'Wins');
      reason = reasonWords(r.reason, loserName, nameHtml);
      if (setup.mode.startsWith('points')) reason += ` · <b class="say-points">+${r.tilesRemaining}&nbsp;${r.tilesRemaining === 1 ? 'point' : 'points'}</b>`;
    } else if (state === 'lost') {
      quiet = true;
      result = matchOver ? verb(name, 'You lose the match', 'Loses the match') : verb(name, 'You lose', 'Loses');
      reason = m.over ? '' : verb(name, 'You open the next&nbsp;game', 'Opens the next&nbsp;game');
    } else {
      result = 'Tie';
      reason = reasonWords('full', '') + (!m.over && m.nextFirst === p ? ` · ${verb(name, 'you open&nbsp;next', 'opens&nbsp;next')}` : '');
    }
    const actions = this.actionSeat() === p ? this.actionsHtml() : '';
    return `<div class="say-over${m.over ? ' match-over' : ''}">
        <div class="say-text"><p class="say-result${quiet ? ' quiet' : ''}">${result}</p>${reason ? `<p class="say-reason">${reason}</p>` : ''}</div>
        ${actions}
      </div>`;
  }

  private openerNote(): string {
    if (this.view.gameNumber === 1) return 'Chosen at random to open the match.';
    return this.previousResult()?.winner === null ? 'Opens after the tie.' : 'Opens after losing the last game.';
  }

  private previousResult(): GameResult | null {
    const games = this.view.saved.games;
    const prev = games[games.length - 2];
    if (!prev) return null;
    let s = newGameFromTiles(prev.tiles, prev.first);
    for (const m of prev.moves) s = applyMove(s, m);
    return s.result;
  }

  /** Where the end-of-game buttons go: the person's seat against the computer, else the next opener's. */
  private actionSeat(): Player {
    const m = this.view.match;
    if (this.setup.opponent === 'computer') return HUMAN_SEAT;
    if (m.over) return m.champion ? opponent(m.champion) : 1;
    return m.nextFirst;
  }

  private actionsHtml(): string {
    const m = this.view.match;
    if (!m.over) return `<div class="say-actions"><button type="button" class="btn primary" data-action="next">Next game${icon('arrow')}</button></div>`;
    return `<div class="say-actions">
      <button type="button" class="btn primary" data-action="again">${icon('restart')} Play again</button>
      <button type="button" class="btn ghost" data-action="home">${icon('home')} Home</button>
    </div>`;
  }

  /* ---------- words for screen readers ---------- */

  private turnSentence(): string {
    const g = this.view.game;
    const name = this.setup.names[g.current - 1];
    if (isComputer(this.setup, g.current)) return 'The computer is thinking.';
    if (!g.lastTile) return `${possessive(name)} turn: take any tile on the outer ring.`;
    return `${possessive(name)} turn: ${orderText(g.lastTile)}.`;
  }

  private resultSentence(r: GameResult): string {
    const names = this.setup.names;
    if (r.winner === null) return 'Tie: the garden is full.';
    const w = names[r.winner - 1];
    const l = names[opponent(r.winner) - 1];
    const m = this.view.match;
    const match = m.over && this.setup.mode !== 'single' ? ` ${verb(w, 'You win the match', `${w} wins the match`)}.` : '';
    return `${verb(w, 'You win', `${w} wins`)}: ${reasonWords(r.reason, l).toLowerCase()}.${match}`;
  }

  private announceTurn(): void {
    this.say(this.turnSentence());
  }

  private say(text: string): void {
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text), 30);
  }
}

function ringIcon(): string {
  const cells = Array.from({ length: 16 }, (_, i) => {
    const r = Math.floor(i / 4);
    const c = i % 4;
    const ring = r === 0 || r === 3 || c === 0 || c === 3;
    return `<rect x="${3 + c * 11}" y="${3 + r * 11}" width="9" height="9" rx="2" class="${ring ? 'ring-on' : 'ring-off'}"/>`;
  }).join('');
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${cells}</svg>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A player's name inside a sentence: escaped, and isolated so a right-to-left name keeps the
 *  sentence's own order and punctuation. */
function nameHtml(name: string): string {
  return `<bdi>${escape(name)}</bdi>`;
}

/** True when any part of a seat's content reaches outside the seat's own box. */
function spills(seat: HTMLElement): boolean {
  const outer = seat.getBoundingClientRect();
  if (outer.height === 0) return false;
  // The seat's padding is breathing room at the screen's edge, not room for content.
  const cs = getComputedStyle(seat);
  const box = { top: outer.top + parseFloat(cs.paddingTop), bottom: outer.bottom - parseFloat(cs.paddingBottom) };
  for (const child of seat.querySelectorAll('.seat-id, .seat-pips, .seat-say > *')) {
    const r = child.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) return true;
  }
  return false;
}

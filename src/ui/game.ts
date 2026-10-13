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
} from '../engine/garden';
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
  /** Called whenever what the menu shows may have changed (Undo's availability). */
  onChange?(): void;
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
  /** The end of a game's buttons, in a card over the middle of the garden. */
  private readonly endCard: HTMLElement;
  private endCardHtml = '';
  private endCardTimer = 0;
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
  /** Whether this screen's seats are tight (see fitNames), decided once per screen size. */
  private fitTight = false;
  /** The seats' fit in play, planned once per screen size from the tallest content a game shows. */
  private plan: Fit | null = null;
  /** True while planFit tries the probes: names are then fitted afresh at each step (applyFit). */
  private planning = false;
  /** The fit at a game's end, which starts from the plan. */
  private overFit: Fit | null = null;
  private onFonts: (() => void) | null = null;
  private deniedIndex: number | null = null;
  /** Flights in the air: a person may answer while the computer's tile still flies. */
  private flights = 0;
  /** A second press of Undo within this time is a double tap, not a second undo. */
  private undoGuardUntil = 0;

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
    this.endCard = document.createElement('div');
    this.endCard.className = 'end-card';
    this.endCard.setAttribute('role', 'group');
    this.endCard.setAttribute('aria-label', 'Game over');
    this.endCard.hidden = true;
    this.el.querySelector('.seam')!.append(this.board.el, this.endCard);
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
    // Continuing a finished game: say how it ended, not whose turn it would be.
    if (this.view.game.result) this.say(this.resultSentence(this.view.game.result));
    else this.announceTurn();
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
      this.plan = null;
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

  /** Say again what matters now (after a sheet closes: screen readers ignore the page behind it). */
  reannounce(): void {
    const r = this.view.game.result;
    this.say(r ? this.resultSentence(r) : this.turnSentence());
  }

  get hasUndo(): boolean {
    return this.setup.opponent === 'computer';
  }

  undo(): void {
    if (!this.hasUndo || this.animating || performance.now() < this.undoGuardUntil) return;
    const u = undo(this.view, this.undoSeat());
    if (!u) return;
    this.undoGuardUntil = performance.now() + UNDO_GUARD_MS;
    this.generation++;
    this.thinking = false;
    this.view = u;
    this.deps.save(u);
    const last = u.game.history[u.game.history.length - 1];
    this.lastIndex = last ? last.index : null;
    this.render(null);
    this.say(`Move taken back. ${this.turnSentence()}`);
    // The Undo button may now be disabled (nothing left to take back): keep focus in the game.
    if (this.undoBtn.disabled && document.activeElement === this.undoBtn) this.board.focusFirstLegal();
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
    // The refusal is no longer than the order it replaces, and may be shorter: the card holds its
    // height so nothing under it moves. Its own height, not one held from an earlier refusal.
    const card = this.el.querySelector<HTMLElement>('.seat.moving .say-order');
    card?.style.removeProperty('min-height');
    const height = card ? card.getBoundingClientRect().height : 0;
    this.renderSeats();
    const shown = this.el.querySelector<HTMLElement>('.seat.moving .say-order');
    if (shown && height) shown.style.minHeight = `${height}px`;
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
    this.flights++;
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
    this.flights--;
    this.animating = this.flights > 0;
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
    const btn = this.endCard.querySelector<HTMLButtonElement>('[data-action]');
    if (btn) {
      if (active === document.body || this.el.contains(active)) btn.focus({ preventScroll: true });
      return;
    }
    if (this.el.contains(active) && !(active as HTMLElement).closest('.cell')) return;
    // Focus in the garden, or lost with the button that was pressed (it is gone): into the garden.
    if (this.el.contains(active) || !active || active === document.body) this.board.focusFirstLegal();
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
    this.renderEndCard();
    this.updateUndo();
  }

  /** Kept as it is while its buttons are the same, so it comes in once, after the brush stroke. */
  private renderEndCard(): void {
    const html = this.view.game.result ? this.actionsHtml() : '';
    if (html === this.endCardHtml) return;
    this.endCardHtml = html;
    this.endCard.innerHTML = html;
    this.endCard.hidden = !html;
    // Not to be pressed before it is seen: a quick second tap on the garden's middle would land on it.
    window.clearTimeout(this.endCardTimer);
    this.endCard.classList.toggle('arriving', !!html);
    if (html) this.endCardTimer = window.setTimeout(() => this.endCard.classList.remove('arriving'), END_CARD_IN_MS);
  }

  private updateUndo(): void {
    // Undo is for play against the computer only: between two people at one screen, as at the
    // table, a tile taken stays taken.
    const can = !this.animating && undo(this.view, this.undoSeat()) !== null;
    this.undoBtn.disabled = !can;
    this.undoBtn.hidden = this.setup.opponent !== 'computer' || !!this.view.game.result;
    this.deps.onChange?.();
  }

  private renderSeats(): void {
    for (const p of [1, 2] as const) this.renderSeat(p);
    this.observeSeatContent();
    this.fitSeats();
  }

  /**
   * The seats never let their content spill, and never drop what a player needs to read. Their fit
   * is planned once per screen size, from the tallest content a game can show (the opening card
   * with its note, the longest order), so the garden keeps its size through a whole game; it only
   * changes at a game's end, when the result needs room, and on a resize. When the seats do not
   * fit, both step together: (1) the row of small tokens becomes a count; then they take room from
   * the garden, up to a tenth of it; (2) the type steps down a size, and they may take up to 15% of
   * the garden; (3) the opener's note moves to the other seat, which has room to spare; (4) the
   * type steps down again; (5) only as a last resort, the note is left out. The garden never gives
   * so much that a tile drops under 44 px. Names have their own steps (fitNames), decided with the
   * plan and kept at a game's end, so the header keeps its shape.
   */
  private fitSeats(): void {
    // Nothing to measure until the screen is on the page.
    if (!this.el.isConnected || this.board.el.getBoundingClientRect().width === 0) return;
    const size = `${innerWidth}x${innerHeight}`;
    if (size !== this.fitSize || !this.plan) {
      this.fitSize = size;
      this.overFit = null;
      // A card's held height (a refusal's, see deny) belongs to the size it was measured at.
      for (const c of this.el.querySelectorAll<HTMLElement>('.say-order')) c.style.removeProperty('min-height');
      this.plan = this.planFit();
    }
    if (!this.view.game.result) {
      // In play: the plan. Should something still not fit (it should not), step up from it.
      this.stepUp(this.plan);
      return;
    }
    if (!this.overFit) {
      const rooms = this.rooms();
      // The type keeps its size (steps 2 and 4); the note steps (3 and 5) have nothing to act on
      // at a game's end.
      this.overFit = { level: Math.min(this.plan.level, 4), room: 0, ...rooms, names: this.plan.names };
    }
    this.stepUp(this.overFit);
  }

  /** The garden's room to give, as it is now with none given: a tenth, and 15% as a last resort. */
  private rooms(): { maxRoom: number; lastRoom: number } {
    const before = this.el.style.getPropertyValue('--seat-room');
    this.el.style.setProperty('--seat-room', '0px');
    const garden = this.board.el.getBoundingClientRect().width;
    this.el.style.setProperty('--seat-room', before);
    // Never so much that a tile (22% of the garden) drops under 44 px, a finger's width.
    const floor = (garden - 44 / 0.22) / 2;
    return {
      maxRoom: Math.max(0, Math.floor(Math.min(garden * 0.1, floor))),
      lastRoom: Math.max(0, Math.floor(Math.min(garden * 0.15, floor))),
    };
  }

  /**
   * Fits the seats to the tallest content a game can show, by putting that content in them for a
   * moment (never painted: this all happens between two frames), in both arrangements (each seat
   * as the one to move), then puts the real content back.
   */
  private planFit(): Fit {
    const over = this.el.classList.contains('is-over');
    this.el.classList.remove('is-over');
    this.el.style.removeProperty('--seat-content-w');
    this.el.classList.remove('fit-1', 'fit-2', 'fit-3', 'fit-4', 'fit-5');
    this.el.style.setProperty('--seat-room', '0px');
    const rooms = this.rooms();
    this.fitTight = !matchMedia('(min-aspect-ratio: 5/4)').matches && (this.board.el.getBoundingClientRect().width - 44 / 0.22) / 2 < 30;
    // The seats' own nodes are set aside and put back as they were, so a tile hidden for a flight
    // and the button that has keyboard focus are still the ones on screen afterwards.
    const real = ([1, 2] as const).map((p) => ({ nodes: [...this.seats[p].childNodes], cls: this.seats[p].className }));
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && (this.seats[1].contains(active) || this.seats[2].contains(active)) ? active : null;
    const fit: Fit = { level: 0, room: 0, ...rooms, names: 0 };
    this.planning = true;
    for (const [mover, waiting] of [[1, 2], [2, 1]] as const) {
      for (const probe of this.probes(mover)) {
        this.seats[mover].className = `seat seat-${mover} moving`;
        this.seats[mover].innerHTML = this.idLineHtml(mover) + `<div class="seat-say">${probe.mover}</div>`;
        this.seats[waiting].className = `seat seat-${waiting} waiting`;
        this.seats[waiting].innerHTML = this.idLineHtml(waiting) + `<div class="seat-say">${probe.waiting}</div>`;
        this.stepUp(fit);
      }
    }
    this.planning = false;
    for (const p of [1, 2] as const) {
      this.seats[p].className = real[p - 1].cls;
      this.seats[p].replaceChildren(...real[p - 1].nodes);
    }
    focused?.focus({ preventScroll: true });
    this.observeSeatContent();
    // Keep the width the seats' content has in play for the whole match at this size: at a game's
    // end the garden steps back, and the header must measure the same to keep its shape.
    const id = this.seats[1].querySelector('.seat-id');
    if (id) this.el.style.setProperty('--seat-content-w', `${id.getBoundingClientRect().width}px`);
    this.el.classList.toggle('is-over', over);
    return fit;
  }

  /** The tallest things a seat shows in play: the opening card with its note, the longest order, and that order refused. */
  private probes(mover: Player): { mover: string; waiting: string }[] {
    // The longest opener's note told from the other seat: "The computer was chosen…", or the
    // longer name's.
    const who = ([1, 2] as const).map((p) => (isComputer(this.setup, p) ? 'The computer' : this.setup.names[p - 1]));
    const longest = who.sort((a, b) => b.length - a.length)[0];
    const awayWho = longest === 'The computer' ? longest : nameHtml(longest);
    const waitWords = isComputer(this.setup, opponent(mover)) ? 'Waiting' : 'Waiting for your turn';
    const tile: Tile = { veg: 'cherry', sym: 'sun' };
    return [
      {
        mover: `<div class="say-order"><span class="say-tile ring">${ringIcon()}</span><p class="say-what">Take any tile on the <b>outer ring</b></p></div><p class="say-note">${NOTE_RANDOM}</p>`,
        waiting: `<p class="say-wait">${waitWords}</p><p class="say-note say-note-away">${awayWho} ${NOTE_RANDOM_AWAY}</p>`,
      },
      {
        mover: `<div class="say-order"><span class="say-tile">${tileSvg(tile)}</span><p class="say-what">${orderHtml(tile)}</p></div>`,
        waiting: `<p class="say-wait">${waitWords}</p>`,
      },
      // The same order refused: its bold first word may be a little wider.
      {
        mover: `<div class="say-order"><span class="say-tile">${tileSvg(tile)}</span><p class="say-what"><b class="nope-word">Only</b> ${orderHtml(tile).replace(/^Take /, '')}</p></div>`,
        waiting: `<p class="say-wait">${waitWords}</p>`,
      },
    ];
  }

  /** Steps the fit up from where it is until the seats hold their content (see fitSeats). */
  private stepUp(fit: Fit): void {
    this.applyFit(fit);
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
    for (const level of [3, 4, 5]) {
      if (fit.level < level && spill()) {
        fit.level = level;
        this.applyFit(fit);
      }
    }
  }

  private applyFit(fit: Fit): void {
    for (const n of [1, 2, 3, 4, 5]) this.el.classList.toggle(`fit-${n}`, fit.level >= n);
    this.el.style.setProperty('--seat-room', `${fit.room}px`);
    // While planning, the names are fitted afresh at each step, as a smaller type may let them back
    // onto one line; after that only forward, so the plan's step holds through a game's end.
    fit.names = this.fitNames(this.fitTight, this.planning ? 0 : fit.names);
  }

  /**
   * Both names at one size, whole, by one rule: the name shares its line with the token count and
   * the score down to 80% (58% where the seats are tight: a portrait screen whose garden cannot give
   * 30 px before tiles drop under 44 px); then the count and score go to the line below and the name
   * has the line to itself, down to 58%; then it wraps onto two lines, breaking inside a word if it
   * must, and finally three. Steps only go forward from `from`, so the plan's step holds at a
   * game's end. Below 18 px the name is set in the interface face, as all text that small is.
   * Only a name that fits none of these would be cut short; the sweep shows none is.
   */
  private fitNames(tight: boolean, from: number): number {
    const names = [1, 2].map((p) => this.seats[p as Player].querySelector<HTMLElement>('.seat-name')).filter((n): n is HTMLElement => !!n);
    // Measured with the clamp lifted, where the name is laid out in full: a clamped box in Chromium
    // draws an ellipsis while reporting neither a scroll overflow nor text past its edge. Too wide
    // (with a pixel to spare: text widths differ by fractions from one screen to another, and with
    // no spare a name 0.3 px too wide at scale 2 showed as "Comput…"; keep it), or more lines than
    // the box shows.
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
    const shared = tight ? [1, 0.9, 0.8, 0.72, 0.64, 0.58] : [1, 0.9, 0.8];
    const steps: [string, number][] = [
      ...shared.map((k): [string, number] => ['', k]),
      ['ids-stacked', 1], ['ids-stacked', 0.9], ['ids-stacked', 0.8], ['ids-stacked', 0.72], ['ids-stacked', 0.64], ['ids-stacked', 0.58],
      ['ids-stacked names-wrap', 0.72], ['ids-stacked names-wrap', 0.64], ['ids-stacked names-wrap', 0.58],
      ['ids-stacked names-wrap names-wrap-3', 0.58],
    ];
    const set = (i: number) => {
      const [cls, scale] = steps[i];
      this.el.classList.remove('ids-stacked', 'names-wrap', 'names-wrap-3', 'names-ui');
      if (cls) this.el.classList.add(...cls.split(' '));
      this.el.style.setProperty('--name-scale', String(scale));
      if (names[0] && parseFloat(getComputedStyle(names[0]).fontSize) < 18) this.el.classList.add('names-ui');
    };
    for (let i = Math.min(from, steps.length - 1); i < steps.length; i++) {
      set(i);
      if (!over()) return i;
    }
    return steps.length - 1;
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
    el.innerHTML = this.idLineHtml(p) + `<div class="seat-say">${this.sayHtml(p, state)}</div>`;
  }

  /** A seat's name line and its tokens in hand. */
  private idLineHtml(p: Player): string {
    const left = tokensInHand(this.view.game, p);
    const tokens = `${left} of ${TOKENS_PER_PLAYER} tokens left`;
    // The tokens still in hand, drawn as small copies of the player's own token; where they have no
    // room, a count takes their place (and their label).
    const pips = Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => (i < left ? tokenSvg(p, 'pip') : '<i class="pip used"></i>')).join('');
    return `
      <div class="seat-id">
        <span class="seat-chip">${tokenSvg(p)}</span>
        <h2 class="seat-name" dir="auto">${escape(this.setup.names[p - 1])}</h2>
        <i class="seat-break" aria-hidden="true"></i>
        <span class="seat-count" role="img" aria-label="${tokens}">${left}<span class="seat-count-of">/${TOKENS_PER_PLAYER}</span></span>
        ${this.scoreHtml(p)}
      </div>
      <div class="seat-pips" role="img" aria-label="${tokens}">${pips}</div>`;
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
    return `<span class="seat-score points" role="img" aria-label="${m.points[p]} of ${target} points"><b>${m.points[p]}</b><span>/${target}</span></span>`;
  }

  private sayHtml(p: Player, state: string): string {
    const g = this.view.game;
    const setup = this.setup;
    const name = setup.names[p - 1];
    const computer = isComputer(setup, p);
    if (state === 'moving') {
      // A refused tap rewrites the card's line for a moment, at the same length ("Only a cherry or
      // rising sun tile"), so the card never grows; the tile shakes, and screen readers hear why.
      const denied = this.deniedIndex !== null && !computer;
      const only = `<b class="nope-word">Only</b>`;
      if (!g.lastTile) {
        // The name is just above the card, so the card speaks to the player, as on later turns.
        const what = computer
          ? `The computer opens<span class="dots" aria-hidden="true"></span>`
          : denied
            ? `${only} a tile on the <b>outer ring</b>`
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
          ? `${only} ${order.replace(/^Take /, '')}`
          : order;
      return `<div class="say-order${computer ? ' thinking' : ''}">
          <span class="say-tile" role="img" aria-label="${escape(opp)} took ${tileLabel(g.lastTile)}">${tileSvg(g.lastTile)}</span>
          <p class="say-what">${what}</p>
        </div>`;
    }
    if (state === 'waiting') {
      const wait = `<p class="say-wait">${computer ? 'Waiting' : verb(name, 'Waiting for your turn', 'Waiting')}</p>`;
      // At an opening move, the opener's note, told from this seat: shown here only on the smallest
      // screens, where the opener's own seat has no room for it (fitSeats, step 3).
      return !g.lastTile && !g.result ? `${wait}<p class="say-note say-note-away">${this.awayNote()}</p>` : wait;
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
      if (setup.mode.startsWith('points')) reason += `&nbsp;· <b class="say-points">+${r.tilesRemaining}&nbsp;${r.tilesRemaining === 1 ? 'point' : 'points'}</b>`;
    } else if (state === 'lost') {
      quiet = true;
      result = matchOver ? verb(name, 'You lose the match', 'Loses the match') : verb(name, 'You lose', 'Loses');
      reason = m.over ? '' : verb(name, 'You open the next&nbsp;game', 'Opens the next&nbsp;game');
    } else {
      result = 'Tie';
      reason = reasonWords('full', '') + (!m.over && m.nextFirst === p ? `&nbsp;· ${verb(name, 'you open&nbsp;next', 'opens&nbsp;next')}` : '');
    }
    return `<div class="say-over${m.over ? ' match-over' : ''}">
        <div class="say-text"><p class="say-result${quiet ? ' quiet' : ''}">${result}</p>${reason ? `<p class="say-reason">${reason}</p>` : ''}</div>
      </div>`;
  }

  private openerNote(): string {
    if (this.view.gameNumber === 1) return NOTE_RANDOM;
    return this.previousResult()?.winner === null ? 'Opens after the&nbsp;tie.' : 'Opens after losing the last&nbsp;game.';
  }

  /** The opener's note as the other seat tells it: "Aki was chosen at random to open the match." */
  private awayNote(): string {
    const opener = this.view.game.current;
    const name = this.setup.names[opener - 1];
    const who = isComputer(this.setup, opener) ? 'The computer' : name === 'You' ? 'You' : nameHtml(name);
    const you = who === 'You';
    if (this.view.gameNumber === 1) return you ? 'You were chosen at random to open the&nbsp;match.' : `${who} ${NOTE_RANDOM_AWAY}`;
    const tail = this.previousResult()?.winner === null ? 'after the&nbsp;tie.' : 'after losing the last&nbsp;game.';
    return `${who} ${you ? 'open' : 'opens'} ${tail}`;
  }

  private previousResult(): GameResult | null {
    const games = this.view.saved.games;
    const prev = games[games.length - 2];
    if (!prev) return null;
    let s = newGameFromTiles(prev.tiles, prev.first);
    for (const m of prev.moves) s = applyMove(s, m);
    return s.result;
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
    // Lower-case the reason's first letter unless it starts with a name ("Ren has no tile to take").
    const why = reasonWords(r.reason, l);
    const reason = r.reason === 'blocked' && l !== 'You' ? why : why.charAt(0).toLowerCase() + why.slice(1);
    const points = this.setup.mode.startsWith('points') ? ` ${verb(w, 'You score', `${w} scores`)} ${r.tilesRemaining} ${r.tilesRemaining === 1 ? 'point' : 'points'}.` : '';
    return `${verb(w, 'You win', `${w} wins`)}: ${reason}.${points}${match}`;
  }

  private announceTurn(): void {
    this.say(this.turnSentence());
  }

  private say(text: string): void {
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text), 30);
  }
}

interface Fit {
  level: number;
  room: number;
  maxRoom: number;
  lastRoom: number;
  /** The names' step in fitNames. */
  names: number;
}

const UNDO_GUARD_MS = 400;
/** The end card's delay and entrance (styles.css, .end-card), after which it can be pressed. */
const END_CARD_IN_MS = 1150;
const NOTE_RANDOM = 'Chosen at random to open the&nbsp;match.';
const NOTE_RANDOM_AWAY = 'was chosen at random to open the&nbsp;match.';

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

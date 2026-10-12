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
import { DIFFICULTY_WORD, MODE_WORD, orderHtml, orderText, possessive, reasonWords, tileWords, verb } from './words';

export interface GameScreenDeps {
  settings(): Settings;
  save(view: MatchView): void;
  openMenu(): void;
  goHome(): void;
}

/** The computer never answers faster than this, so its move can be followed. */
const MIN_THINK_MS = 700;

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
  /** Bumped whenever a pending computer move must be ignored (undo, new game, leaving). */
  private generation = 0;
  private lastIndex: number | null = null;
  private destroyed = false;
  private deniedTimer = 0;
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
  }

  /** The current match, for saving and the menu. */
  get match(): MatchView {
    return this.view;
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    window.clearTimeout(this.deniedTimer);
  }

  /** Re-read settings (playable-tile marking) after they change. */
  refresh(): void {
    this.render(null);
  }

  focusBoard(): void {
    this.board.focusFirstLegal();
  }

  get canUndo(): boolean {
    return !this.animating && undo(this.view, this.undoSeat()) !== null;
  }

  undo(): void {
    if (this.animating) return;
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
    return !g.result && !this.animating && !this.thinking && !isComputer(this.setup, g.current);
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
    const parts = [`Game ${this.view.gameNumber}`, MODE_WORD[this.setup.mode]];
    if (this.setup.opponent === 'computer') parts.push(DIFFICULTY_WORD[this.setup.difficulty]);
    if (m.ties > 0 && this.setup.mode !== 'single') parts.push(`${m.ties} ${m.ties === 1 ? 'tie' : 'ties'}`);
    this.label.textContent = parts.join(' · ');
    this.renderSeats();
    this.updateUndo();
  }

  private updateUndo(): void {
    const can = !this.animating && undo(this.view, this.undoSeat()) !== null;
    this.undoBtn.disabled = !can;
    this.undoBtn.hidden = !!this.view.game.result;
  }

  private renderSeats(): void {
    for (const p of [1, 2] as const) this.renderSeat(p);
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
    const pips = Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => `<i class="pip${i < left ? '' : ' used'}"></i>`).join('');
    const idLine = `
      <div class="seat-id">
        <span class="seat-chip">${tokenSvg(p)}</span>
        <h2 class="seat-name">${escape(name)}</h2>
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
      const dots = [0, 1, 2].map((i) => `<i class="win-dot${i < m.wins[p] ? ' on' : ''}"></i>`).join('');
      return `<span class="seat-score" role="img" aria-label="${m.wins[p]} of 3 wins">${dots}</span>`;
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
      const head = computer ? `<p class="say-head thinking">Thinking<span class="dots" aria-hidden="true"></span></p>` : `<p class="say-head">${possessive(name)} turn</p>`;
      if (!g.lastTile) {
        return `${head}
          <div class="say-order">
            <span class="say-tile ring" aria-hidden="true">${ringIcon()}</span>
            <p>${computer ? 'Opens' : verb(name, 'You open', 'Opens')}: take any tile on the <b>outer ring</b></p>
          </div>
          <p class="say-note">${this.openerNote()}</p>`;
      }
      const opp = setup.names[opponent(p) - 1];
      const denied = this.deniedIndex !== null && !computer ? this.deniedNote() : '';
      return `${head}
        <div class="say-order">
          <span class="say-tile" role="img" aria-label="${escape(opp)} took ${tileLabel(g.lastTile)}">${tileSvg(g.lastTile)}</span>
          <p>${orderHtml(g.lastTile)}</p>
        </div>${denied}`;
    }
    if (state === 'waiting') {
      return `<p class="say-wait">${computer ? 'Waiting' : verb(name, 'Waiting for your turn', 'Waiting')}</p>`;
    }
    const r = g.result!;
    const m = this.view.match;
    const loserName = r.winner ? setup.names[opponent(r.winner) - 1] : '';
    let html = '';
    if (state === 'won') {
      const pts = setup.mode.startsWith('points') ? `<p class="say-points">+${r.tilesRemaining} ${r.tilesRemaining === 1 ? 'point' : 'points'}</p>` : '';
      const head = m.over && setup.mode !== 'single' ? verb(name, 'You win the match', 'Wins the match') : verb(name, 'You win', 'Wins');
      html = `<p class="say-result">${head}</p><p class="say-reason">${reasonWords(r.reason, loserName)}</p>${pts}`;
    } else if (state === 'lost') {
      const head = m.over && setup.mode !== 'single' ? verb(name, 'You lose the match', 'Loses the match') : verb(name, 'You lose', 'Loses');
      const opens = !m.over ? `<p class="say-reason">${verb(name, 'You open the next game', 'Opens the next game')}</p>` : '';
      html = `<p class="say-result quiet">${head}</p>${opens}`;
    } else {
      const opens = !m.over && m.nextFirst === p ? `<p class="say-reason">${verb(name, 'You open the next game', 'Opens the next game')}</p>` : '';
      html = `<p class="say-result">Tie</p><p class="say-reason">${reasonWords('full', '')}</p>${opens}`;
    }
    if (this.actionSeat() === p) html += this.actionsHtml();
    return html;
  }

  private deniedNote(): string {
    const g = this.view.game;
    const i = this.deniedIndex!;
    const c = g.board[i];
    if (c.kind !== 'tile' || !g.lastTile) return '';
    return `<p class="say-note warn">That ${tileWords(c.tile)} tile shares nothing with it.</p>`;
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
    if (!m.over) return `<div class="say-actions"><button type="button" class="btn primary" data-action="next">Next game ${icon('arrow')}</button></div>`;
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

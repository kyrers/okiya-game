/**
 * The garden: 16 buttons that keep their DOM nodes across renders, so moves can animate and keyboard
 * focus survives. Only cells whose content changed are rewritten.
 */
import { CELL_COUNT, colOf, rowOf, tileCode, type GameState, type Player, type Tile } from '../engine/garden';
import { tokenSvg } from './art';
import { tileLabel, tileSvg } from './tileArt';
import { possessive } from './words';

export interface BoardRender {
  readonly state: GameState;
  /** Cells the person at the screen may take now (empty while the computer moves or after the end). */
  readonly legal: ReadonlySet<number>;
  /** Lift the takeable tiles (setting). */
  readonly showLegal: boolean;
  /** The cell taken by the last move, if any. */
  readonly lastIndex: number | null;
  /** Animate the token that was just placed in this cell. */
  readonly justPlaced: number | null;
  readonly names: readonly [string, string];
}

export interface BoardHandlers {
  onTake(index: number): void;
  onDenied(index: number): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A token's drop (`.cell.placed .token`, 0.42s in styles.css) starts from nothing, so the token is
 * only seen once the drop has run. The drop is undone when it ends, and at the latest after this
 * long: a browser that runs no frames for a while (headless WebKit under load ran none for
 * seconds) never starts it, and would leave the token at its first, invisible frame until the next
 * move, as the flying tile has its own guard for.
 */
const SET_DOWN_MS = 700;

/** Whether the player's last input was a key press, rather than a touch or a click. */
let keyboardLast = false;
window.addEventListener('keydown', () => (keyboardLast = true), true);
window.addEventListener('pointerdown', () => (keyboardLast = false), true);

export class BoardView {
  readonly el: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly brush: SVGSVGElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly keys: string[] = [];
  /** Per cell, the timer that ends its token's drop if the drop never ends by itself. */
  private readonly setDown: number[] = [];
  private focusIndex = 0;
  private last: BoardRender | null = null;
  private readonly resize: ResizeObserver | null;

  constructor(private readonly handlers: BoardHandlers, label = 'The garden') {
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.grid = document.createElement('div');
    this.grid.className = 'board-grid';
    this.grid.setAttribute('role', 'group');
    this.grid.setAttribute('aria-label', label);
    for (let i = 0; i < CELL_COUNT; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.index = String(i);
      b.tabIndex = i === 0 ? 0 : -1;
      this.cells.push(b);
      this.keys.push('');
      this.grid.append(b);
    }
    this.brush = document.createElementNS(SVG_NS, 'svg');
    this.brush.classList.add('board-brush');
    this.brush.setAttribute('aria-hidden', 'true');
    this.el.append(this.grid, this.brush);

    this.grid.addEventListener('click', (ev) => {
      const cell = (ev.target as Element).closest<HTMLButtonElement>('.cell');
      if (cell) this.activate(Number(cell.dataset.index));
    });
    this.grid.addEventListener('keydown', (ev) => this.onKey(ev));
    this.grid.addEventListener('animationend', (ev) => {
      const cell = ev.animationName === 'set-down' ? (ev.target as Element).closest<HTMLButtonElement>('.cell') : null;
      if (cell) this.settle(Number(cell.dataset.index));
    });
    this.grid.addEventListener('focusin', (ev) => {
      const cell = (ev.target as Element).closest<HTMLButtonElement>('.cell');
      if (cell) this.setFocusIndex(Number(cell.dataset.index));
    });
    this.resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.drawBrush(false));
    this.resize?.observe(this.grid);
  }

  cell(index: number): HTMLButtonElement {
    return this.cells[index];
  }

  /** Lets go of what the garden watches (its size, for the brush stroke). */
  destroy(): void {
    this.resize?.disconnect();
    this.setDown.forEach((t) => window.clearTimeout(t));
  }

  render(r: BoardRender): void {
    const { state } = r;
    const win = state.result;
    const winCells = new Set(win?.cells ?? []);
    for (let i = 0; i < CELL_COUNT; i++) {
      const c = state.board[i];
      const b = this.cells[i];
      const key = c.kind === 'tile' ? `t${tileCode(c.tile)}` : `p${c.player}`;
      if (key !== this.keys[i]) {
        b.innerHTML = c.kind === 'tile' ? tileSvg(c.tile) : `<span class="token">${tokenSvg(c.player)}</span>`;
        b.dataset.cell = key.slice(1);
        this.keys[i] = key;
      }
      const legal = r.legal.has(i);
      b.classList.toggle('is-tile', c.kind === 'tile');
      b.classList.toggle('is-token', c.kind === 'token');
      b.classList.toggle('p1', c.kind === 'token' && c.player === 1);
      b.classList.toggle('p2', c.kind === 'token' && c.player === 2);
      b.classList.toggle('legal', legal);
      b.classList.toggle('show-legal', legal && r.showLegal);
      b.classList.toggle('last', r.lastIndex === i);
      b.classList.toggle('in-win', winCells.has(i));
      b.classList.toggle('dead', !!win && c.kind === 'tile');
      if (r.justPlaced === i) {
        b.classList.remove('placed');
        void b.offsetWidth; // restart the drop animation
        b.classList.add('placed');
        window.clearTimeout(this.setDown[i]);
        this.setDown[i] = window.setTimeout(() => this.settle(i), SET_DOWN_MS);
      } else this.settle(i);
      b.setAttribute('aria-label', this.label(i, r));
      if (c.kind === 'tile' && !legal) b.setAttribute('aria-disabled', 'true');
      else if (c.kind === 'token') b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
    this.el.classList.toggle('has-legal', r.legal.size > 0 && r.showLegal);
    // A person may take a tile now: every tile answers the pointer alike, so a hover never tells
    // which tiles may be taken when marking them is turned off.
    this.el.classList.toggle('can-take', r.legal.size > 0);
    this.el.classList.toggle('over', !!win);
    const prev = this.last;
    this.last = r;
    if (!win) this.brush.replaceChildren();
    else if (!prev?.state.result) this.drawBrush(true);
  }

  focus(): void {
    this.cells[this.focusIndex].focus();
  }

  /** The token in cell `i` is at rest: its drop is over, whether or not it ever ran. */
  private settle(i: number): void {
    window.clearTimeout(this.setDown[i]);
    this.cells[i].classList.remove('placed');
  }

  /** Moves the garden's tab stop to the first tile that may be taken (or leaves it where focus last
   *  rested: the computer's turn, the game over), unless the garden already holds focus; and, for
   *  a player using the keyboard, puts focus there. After a touch, WebKit would draw a focus ring
   *  on the tile, so focus is left alone. */
  focusFirstLegal(): void {
    if (!this.last || this.grid.contains(document.activeElement)) return;
    const first = [...this.last.legal][0];
    this.setFocusIndex(first ?? this.focusIndex);
    if (keyboardLast) this.cells[this.focusIndex].focus({ preventScroll: true });
  }

  private label(i: number, r: BoardRender): string {
    const where = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}`;
    const c = r.state.board[i];
    if (c.kind === 'token') {
      const win = r.state.result?.cells.includes(i) ? ', part of the winning formation' : '';
      return `${where}: ${possessive(r.names[c.player - 1])} token${win}`;
    }
    const legal = r.legal.has(i) ? ', can be taken' : '';
    return `${where}: ${tileLabel(c.tile)}${legal}`;
  }

  private activate(i: number): void {
    if (!this.last) return;
    this.setFocusIndex(i);
    if (this.last.legal.has(i)) this.handlers.onTake(i);
    else if (this.last.state.board[i].kind === 'tile' && !this.last.state.result) this.handlers.onDenied(i);
  }

  private setFocusIndex(i: number): void {
    if (i === this.focusIndex) return;
    this.cells[this.focusIndex].tabIndex = -1;
    this.focusIndex = i;
    this.cells[i].tabIndex = 0;
  }

  private onKey(ev: KeyboardEvent): void {
    const i = this.focusIndex;
    const r = rowOf(i);
    const c = colOf(i);
    let next = -1;
    switch (ev.key) {
      case 'ArrowUp': next = r > 0 ? i - 4 : i; break;
      case 'ArrowDown': next = r < 3 ? i + 4 : i; break;
      case 'ArrowLeft': next = c > 0 ? i - 1 : i; break;
      case 'ArrowRight': next = c < 3 ? i + 1 : i; break;
      case 'Home': next = r * 4; break;
      case 'End': next = r * 4 + 3; break;
      default: return;
    }
    ev.preventDefault();
    this.setFocusIndex(next);
    this.cells[next].focus();
  }

  /** The brush stroke round a winning formation, in board coordinates measured from the cells. */
  private drawBrush(animate: boolean): void {
    const win = this.last?.state.result;
    if (!win || win.cells.length === 0) {
      this.brush.replaceChildren();
      return;
    }
    const box = this.el.getBoundingClientRect();
    if (box.width === 0) return;
    this.brush.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const centre = (i: number) => {
      const r = this.cells[i].getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, s: r.width };
    };
    const pts = win.cells.map(centre);
    const s = pts[0].s;
    const player = win.winner as Player;
    // Drawn round the formation, not through it: a thin loop of ink that leaves every token clear.
    let d: string;
    if (win.reason === 'square') {
      // A rounded square round the four, its sides between the tokens and the cells' edges (a
      // circle cannot pass between four discs), so it stays inside the 2x2 block even in a corner.
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const [l, rt, t, b] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const r = s * 0.44;
      // Closing past its start, as a hand would draw it.
      d = `M ${l + s * 0.12} ${t - r} L ${rt} ${t - r} A ${r} ${r} 0 0 1 ${rt + r} ${t} L ${rt + r} ${b} A ${r} ${r} 0 0 1 ${rt} ${b + r} L ${l} ${b + r} A ${r} ${r} 0 0 1 ${l - r} ${b} L ${l - r} ${t} A ${r} ${r} 0 0 1 ${l} ${t - r} L ${l + s * 0.45} ${t - r * 0.94}`;
    } else {
      // A long loop round the line of four, closing past its start as a hand would draw it. Its
      // sides run between the tokens and the cells' edges, so it stays inside the row.
      const a = pts[0];
      const b = pts[pts.length - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const nx = -uy;
      const ny = ux;
      const r = s * 0.44;
      const at = (p: { x: number; y: number }, along: number, across: number) => `${p.x + ux * along + nx * across} ${p.y + uy * along + ny * across}`;
      d = `M ${at(a, s * 0.12, -r)} L ${at(b, 0, -r)} A ${r} ${r} 0 0 1 ${at(b, 0, r)} L ${at(a, 0, r)} A ${r} ${r} 0 0 1 ${at(a, 0, -r)} L ${at(a, s * 0.45, -r * 0.94)}`;
    }
    const shape = document.createElementNS(SVG_NS, 'path');
    shape.setAttribute('d', d);
    shape.setAttribute('class', `brush-stroke p${player}`);
    const width = s * 0.075;
    shape.setAttribute('stroke-width', String(width));
    // The rough edge: a displacement filter whose region is this stroke's own box in user space.
    // (A bounding-box region is empty for a row or column, whose path has zero height; an
    // oversized region is dropped by WebKit.)
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = s * 1.3;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = 'board-brush-edge';
    for (const [k, v] of Object.entries({
      filterUnits: 'userSpaceOnUse',
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + 2 * pad,
      height: Math.max(...ys) - Math.min(...ys) + 2 * pad,
    })) filter.setAttribute(k, String(v));
    filter.innerHTML = `<feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${(s * 0.035).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/>`;
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.append(filter);
    shape.setAttribute('filter', 'url(#board-brush-edge)');
    this.brush.replaceChildren(defs, shape);
    const length = shape.getTotalLength?.() ?? 0;
    if (animate && length > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('reduce-motion')) {
      shape.style.strokeDasharray = `${length}`;
      shape.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 650, delay: 180, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    }
  }
}

/**
 * The taken tile lifts out of the garden and lands on `target` (where the next player reads it), or
 * rises and fades when there is none. `host` holds the flying tile: the page, or an open dialog,
 * which sits in the top layer above anything appended to the page.
 */
export function flyTile(from: DOMRect, tile: Tile, target: HTMLElement | null, host: HTMLElement = document.body): Promise<void> {
  const fly = document.createElement('div');
  fly.className = 'flyer';
  fly.innerHTML = tileSvg(tile);
  Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  host.append(fly);
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
    let guard = 0;
    const done = () => {
      window.clearTimeout(guard);
      fly.remove();
      if (target) target.style.visibility = '';
      resolve();
    };
    anim.onfinish = done;
    anim.oncancel = done;
    guard = window.setTimeout(done, 900); // never leave the board locked
  });
}

/** A static garden (home screen): every tile face up, nothing to take. */
export function staticGarden(state: GameState): HTMLDivElement {
  const view = new BoardView({ onTake: () => undefined, onDenied: () => undefined }, 'A garden of sixteen tiles');
  view.render({ state, legal: new Set(), showLegal: false, lastIndex: null, justPlaced: null, names: ['', ''] });
  view.el.classList.add('static');
  view.el.querySelectorAll('button').forEach((b) => {
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
  });
  view.el.setAttribute('aria-hidden', 'true');
  return view.el;
}

/**
 * The garden: 16 buttons that keep their DOM nodes across renders, so moves can animate and keyboard
 * focus survives. Only cells whose content changed are rewritten.
 */
import { CELL_COUNT, colOf, rowOf, tileCode, type GameState, type Player } from '../engine/okiya';
import { tokenSvg } from './art';
import { tileLabel, tileSvg } from './tileArt';

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

export class BoardView {
  readonly el: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly brush: SVGSVGElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly keys: string[] = [];
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
      } else b.classList.remove('placed');
      b.setAttribute('aria-label', this.label(i, r));
      if (c.kind === 'tile' && !legal) b.setAttribute('aria-disabled', 'true');
      else if (c.kind === 'token') b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
    this.el.classList.toggle('has-legal', r.legal.size > 0 && r.showLegal);
    this.el.classList.toggle('over', !!win);
    const prev = this.last;
    this.last = r;
    if (!win) this.brush.replaceChildren();
    else if (!prev?.state.result) this.drawBrush(true);
  }

  focus(): void {
    this.cells[this.focusIndex].focus();
  }

  /** Focus the first takeable cell, if the board does not already hold focus. */
  focusFirstLegal(): void {
    if (!this.last) return;
    const first = [...this.last.legal][0];
    if (first === undefined) return;
    if (!this.grid.contains(document.activeElement)) this.setFocusIndex(first);
  }

  private label(i: number, r: BoardRender): string {
    const where = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}`;
    const c = r.state.board[i];
    if (c.kind === 'token') {
      const win = r.state.result?.cells.includes(i) ? ', part of the winning formation' : '';
      return `${where}: ${r.names[c.player - 1]}'s token${win}`;
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

  /** The brush stroke through a winning formation, in board coordinates measured from the cells. */
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
    let shape: SVGElement;
    if (win.reason === 'square') {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const rad = s * 1.02;
      shape = document.createElementNS(SVG_NS, 'path');
      // A brush circle that overshoots its start, as a hand would draw it.
      shape.setAttribute(
        'd',
        `M ${cx - rad * 0.2} ${cy - rad} A ${rad} ${rad} 0 1 1 ${cx - rad * 0.98} ${cy + rad * 0.12} A ${rad} ${rad} 0 0 1 ${cx + rad * 0.12} ${cy - rad * 0.99}`,
      );
    } else {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const ex = (dx / len) * s * 0.42;
      const ey = (dy / len) * s * 0.42;
      shape = document.createElementNS(SVG_NS, 'path');
      shape.setAttribute('d', `M ${a.x - ex} ${a.y - ey} L ${b.x + ex} ${b.y + ey}`);
    }
    shape.setAttribute('class', `brush-stroke p${player}`);
    shape.setAttribute('stroke-width', String(s * 0.26));
    this.brush.replaceChildren(shape);
    const length = (shape as SVGPathElement).getTotalLength?.() ?? 0;
    if (animate && length > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('reduce-motion')) {
      shape.style.strokeDasharray = `${length}`;
      shape.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 650, delay: 180, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    }
  }
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

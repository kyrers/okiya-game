/**
 * Renders an Okiya board (GameState) into a container element.
 * Framework-free: re-renders the 16 cells on each call; cheap enough for a 4x4 grid.
 */
import { legalMoves, type GameState, type Player } from '../engine/okiya';
import { tileLabel, tileSvg } from './tileArt';

export interface BoardOptions {
  /** Which player is the human (their legal moves are clickable). */
  human: Player | null;
  onMove: (index: number) => void;
  /** Index of the most recently played cell, for the "just placed" animation. */
  lastIndex?: number | null;
  /** Extra class names for individual cells (e.g. charm highlights). */
  cellClass?: (index: number) => string;
}

export function renderBoard(container: HTMLElement, state: GameState, opts: BoardOptions): void {
  const legal = new Set(opts.human !== null && state.current === opts.human && !state.win ? legalMoves(state) : []);
  const winCells = new Set(state.win?.cells ?? []);
  container.classList.add('board');
  container.setAttribute('role', 'grid');
  container.setAttribute('aria-label', 'Okiya garden');
  const html: string[] = [];
  for (let i = 0; i < 16; i++) {
    const cell = state.board[i];
    const classes = ['cell'];
    let inner = '';
    let label = '';
    if (cell.kind === 'tile') {
      classes.push('cell-tile');
      if (legal.has(i)) classes.push('legal');
      inner = tileSvg(cell.tile);
      label = tileLabel(cell.tile) + (legal.has(i) ? ', playable' : '');
    } else {
      classes.push('cell-token', `token-p${cell.player}`);
      if (winCells.has(i)) classes.push('win');
      if (opts.lastIndex === i) classes.push('just-placed');
      inner = `<span class="token"><span class="token-face"></span></span>`;
      label = `Player ${cell.player} token`;
    }
    if (opts.cellClass) classes.push(opts.cellClass(i));
    const clickable = legal.has(i);
    html.push(
      `<button type="button" class="${classes.join(' ')}" data-index="${i}" role="gridcell" aria-label="${label}" ${clickable ? '' : 'tabindex="-1" aria-disabled="true"'}>${inner}</button>`,
    );
  }
  container.innerHTML = html.join('');
  container.onclick = (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('.cell.legal');
    if (!target) return;
    opts.onMove(Number(target.dataset.index));
  };
}

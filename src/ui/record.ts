/**
 * The play by play: every move of the game just played, in order, as the tile each player took,
 * with that player's token. The last move says how the game ended. Opened from the end slip and
 * the menu once a game is over.
 */
import { opponent, type GameState, type Move } from '../engine/garden';
import { tokenSvg } from './art';
import { escapeHtml } from './dom';
import { tileSvg } from './tileArt';
import { reasonWords, tileWords } from './words';

export interface RecordRow {
  /** The move's number, from 1. */
  readonly n: number;
  readonly move: Move;
  /** How the game ended, on its last move only. */
  readonly note: string | null;
}

/** The rows of a game's play by play; `show` prints a name inside the note, as in reasonWords. */
export function recordRows(game: GameState, names: readonly [string, string], show: (name: string) => string = (n) => n): RecordRow[] {
  const r = game.result;
  const last = game.history.length - 1;
  const note = !r ? null : r.winner === null ? reasonWords('full', '') : reasonWords(r.reason, names[opponent(r.winner) - 1], show);
  return game.history.map((move, i) => ({ n: i + 1, move, note: i === last ? note : null }));
}

const nameHtml = (name: string): string => `<bdi>${escapeHtml(name)}</bdi>`;

export function recordHtml(game: GameState, names: readonly [string, string]): string {
  const who = ([1, 2] as const)
    .map((p) => `<span class="record-player"><span class="inline-chip">${tokenSvg(p)}</span>${nameHtml(names[p - 1])}</span>`)
    .join('');
  const rows = recordRows(game, names, nameHtml)
    .map(({ n, move, note }) => `<li class="record-move${note ? ' record-last' : ''}">
        <span class="record-n">${n}</span>
        <span class="record-token">${tokenSvg(move.player)}</span>
        <span class="record-tile">${tileSvg(move.tile)}</span>
        <span class="record-words"><span class="sr-only">${nameHtml(names[move.player - 1])}:</span> ${tileWords(move.tile)}${note ? `<span class="record-note">${note}</span>` : ''}</span>
      </li>`)
    .join('');
  return `<div class="record"><p class="record-who">${who}</p><ol class="record-list">${rows}</ol></div>`;
}

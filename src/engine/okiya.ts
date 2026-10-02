/**
 * Okiya (a.k.a. Niya) — official rules engine.
 *
 * Source: Blue Orange "Okiya Print & Play" rules (Bruno Cathala, Cyril Bouquet),
 * https://blueorangegames.eu/wp-content/uploads/2020/04/Okiya-PnP-EN.pdf
 *
 * Rules implemented here (verbatim summary of the PDF):
 *  - 16 garden tiles = every combination of 4 vegetations x 4 symbols, shuffled
 *    face up into a 4x4 square.
 *  - Each player has 8 character tokens of their own pattern.
 *  - The first player must take a tile on the OUTSIDE BORDER of the garden
 *    (the 4 middle tiles are forbidden on the first turn) and replaces it with
 *    one of their tokens.
 *  - Every following move must take a tile that shares the vegetation OR the
 *    symbol with the tile that was just removed, and replace it with a token.
 *  - A player wins immediately on completing a row of 4 of their tokens
 *    (horizontal, vertical or diagonal), or a 2x2 square of their tokens.
 *  - A player also wins if the opponent has no legal move ("blocked").
 *  - Victory-points variant: the winner scores as many points as there are
 *    garden tiles left in the garden.
 *
 * This module is pure and side-effect free. State objects are never mutated;
 * every operation returns a new state.
 */

export const VEGETATIONS = ['maple', 'cherry', 'pine', 'iris'] as const;
export const SYMBOLS = ['sun', 'poem', 'bird', 'rain'] as const;

export type Vegetation = (typeof VEGETATIONS)[number];
export type Symbol = (typeof SYMBOLS)[number];

export interface Tile {
  readonly veg: Vegetation;
  readonly sym: Symbol;
}

export type Player = 1 | 2;

/** A board cell is either a garden tile still in place, or a player's token. */
export type Cell = { kind: 'tile'; tile: Tile } | { kind: 'token'; player: Player };

export type WinReason = 'row' | 'column' | 'diagonal' | 'square' | 'blocked';

export interface WinInfo {
  readonly winner: Player;
  readonly reason: WinReason;
  /** Board indices (0..15) of the winning formation; empty for a block. */
  readonly cells: readonly number[];
  /** Garden tiles still in the garden when the game ended (= victory points). */
  readonly tilesRemaining: number;
}

export interface Move {
  readonly player: Player;
  readonly index: number;
  readonly tile: Tile;
}

export interface GameState {
  readonly board: readonly Cell[]; // 16 cells, row-major, index = row*4 + col
  readonly current: Player;
  /** The tile removed on the previous move; null before the first move. */
  readonly lastTile: Tile | null;
  readonly history: readonly Move[];
  readonly win: WinInfo | null;
}

export const BOARD_SIZE = 4;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
export const TOKENS_PER_PLAYER = 8;

/** The 4 centre cells which the first player may NOT take. */
export const CENTRE_CELLS: readonly number[] = [5, 6, 9, 10];
/** The 12 border cells, the only legal first moves. */
export const BORDER_CELLS: readonly number[] = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15];

/** All 16 distinct tiles in a canonical order (veg-major). */
export function allTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const veg of VEGETATIONS) for (const sym of SYMBOLS) tiles.push({ veg, sym });
  return tiles;
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.veg === b.veg && a.sym === b.sym;
}

/** Two tiles "share an element" if they have the same vegetation or the same symbol. */
export function sharesElement(a: Tile, b: Tile): boolean {
  return a.veg === b.veg || a.sym === b.sym;
}

export function opponent(p: Player): Player {
  return p === 1 ? 2 : 1;
}

export function rowOf(index: number): number {
  return Math.floor(index / BOARD_SIZE);
}
export function colOf(index: number): number {
  return index % BOARD_SIZE;
}
export function indexOf(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

/**
 * Winning formations: 4 rows, 4 columns, 2 diagonals and 9 2x2 squares.
 * Order matters for deterministic reporting: rows, columns, diagonals, squares.
 */
export interface Formation {
  readonly reason: Exclude<WinReason, 'blocked'>;
  readonly cells: readonly number[];
}

export const FORMATIONS: readonly Formation[] = (() => {
  const out: Formation[] = [];
  for (let r = 0; r < 4; r++) out.push({ reason: 'row', cells: [0, 1, 2, 3].map((c) => indexOf(r, c)) });
  for (let c = 0; c < 4; c++) out.push({ reason: 'column', cells: [0, 1, 2, 3].map((r) => indexOf(r, c)) });
  out.push({ reason: 'diagonal', cells: [0, 5, 10, 15] });
  out.push({ reason: 'diagonal', cells: [3, 6, 9, 12] });
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out.push({
        reason: 'square',
        cells: [indexOf(r, c), indexOf(r, c + 1), indexOf(r + 1, c), indexOf(r + 1, c + 1)],
      });
  return out;
})();

/** Deterministic PRNG (mulberry32) so games can be reproduced from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build a fresh game from an explicit tile layout (16 distinct tiles). */
export function newGameFromTiles(tiles: readonly Tile[], first: Player = 1): GameState {
  if (tiles.length !== CELL_COUNT) throw new Error(`expected ${CELL_COUNT} tiles, got ${tiles.length}`);
  const seen = new Set<string>();
  for (const t of tiles) {
    const key = `${t.veg}/${t.sym}`;
    if (seen.has(key)) throw new Error(`duplicate tile ${key}`);
    seen.add(key);
  }
  return {
    board: tiles.map((tile) => ({ kind: 'tile', tile }) as Cell),
    current: first,
    lastTile: null,
    history: [],
    win: null,
  };
}

/** Build a fresh game with a seeded random layout. */
export function newGame(seed: number, first: Player = 1): GameState {
  return newGameFromTiles(shuffle(allTiles(), mulberry32(seed)), first);
}

/**
 * Legal moves for the player to move. Empty if the game is over.
 *  - First move: any border cell (never the 4 centre cells).
 *  - Later moves: any remaining tile sharing veg or symbol with `lastTile`.
 */
export function legalMoves(state: GameState): number[] {
  if (state.win) return [];
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = state.board[i];
    if (cell.kind !== 'tile') continue;
    if (state.lastTile === null) {
      if (!CENTRE_CELLS.includes(i)) out.push(i);
    } else if (sharesElement(cell.tile, state.lastTile)) {
      out.push(i);
    }
  }
  return out;
}

export function isLegalMove(state: GameState, index: number): boolean {
  return legalMoves(state).includes(index);
}

/** Find the first winning formation for `player`, or null. */
export function findWin(board: readonly Cell[], player: Player): Formation | null {
  for (const f of FORMATIONS) {
    if (f.cells.every((i) => board[i].kind === 'token' && board[i].player === player)) return f;
  }
  return null;
}

export function tilesRemaining(board: readonly Cell[]): number {
  return board.reduce((n, c) => n + (c.kind === 'tile' ? 1 : 0), 0);
}

/**
 * Apply a move: the current player takes the tile at `index` and replaces it
 * with one of their tokens. Throws on an illegal move. Resolves the win check
 * (formation first, then "opponent is blocked").
 */
export function applyMove(state: GameState, index: number): GameState {
  if (state.win) throw new Error('game is over');
  if (!isLegalMove(state, index)) throw new Error(`illegal move ${index}`);
  const cell = state.board[index];
  if (cell.kind !== 'tile') throw new Error('unreachable: legal move on non-tile');
  const player = state.current;
  const board = state.board.slice();
  board[index] = { kind: 'token', player };
  const move: Move = { player, index, tile: cell.tile };
  const next: GameState = {
    board,
    current: opponent(player),
    lastTile: cell.tile,
    history: [...state.history, move],
    win: null,
  };
  const remaining = tilesRemaining(board);
  const formation = findWin(board, player);
  if (formation) {
    return { ...next, win: { winner: player, reason: formation.reason, cells: formation.cells, tilesRemaining: remaining } };
  }
  if (legalMoves(next).length === 0) {
    return { ...next, win: { winner: player, reason: 'blocked', cells: [], tilesRemaining: remaining } };
  }
  return next;
}

/** Tokens the player still has in hand (8 minus those placed). */
export function tokensInHand(state: GameState, player: Player): number {
  return TOKENS_PER_PLAYER - state.history.filter((m) => m.player === player).length;
}

/* ---------- Match layer (End of the game variants from the PDF) ---------- */

export type MatchMode = 'single' | 'sets3' | 'points10';

export interface MatchState {
  readonly mode: MatchMode;
  readonly wins: Readonly<Record<Player, number>>;
  readonly points: Readonly<Record<Player, number>>;
  readonly gamesPlayed: number;
  /** Winner of the whole match, if decided. */
  readonly champion: Player | null;
  /** Who starts the next game: the loser of the previous one. */
  readonly nextFirst: Player;
}

export function newMatch(mode: MatchMode, first: Player = 1): MatchState {
  return { mode, wins: { 1: 0, 2: 0 }, points: { 1: 0, 2: 0 }, gamesPlayed: 0, champion: null, nextFirst: first };
}

export function pointsTarget(mode: MatchMode): number {
  return mode === 'points10' ? 10 : Infinity;
}

/** Record a finished game into the match. */
export function recordGame(match: MatchState, win: WinInfo): MatchState {
  if (match.champion) throw new Error('match is over');
  const w = win.winner;
  const wins = { ...match.wins, [w]: match.wins[w] + 1 };
  const points = { ...match.points, [w]: match.points[w] + win.tilesRemaining };
  let champion: Player | null = null;
  if (match.mode === 'single') champion = w;
  else if (match.mode === 'sets3' && wins[w] >= 3) champion = w;
  else if (match.mode === 'points10' && points[w] >= 10) champion = w;
  return {
    ...match,
    wins,
    points,
    gamesPlayed: match.gamesPlayed + 1,
    champion,
    nextFirst: opponent(w), // the loser of the previous game starts
  };
}

/* ---------- Helpers for tests & rendering ---------- */

const VEG_CODE: Record<Vegetation, string> = { maple: 'M', cherry: 'C', pine: 'P', iris: 'I' };
const SYM_CODE: Record<Symbol, string> = { sun: 's', poem: 'p', bird: 'b', rain: 'r' };
const VEG_FROM: Record<string, Vegetation> = { M: 'maple', C: 'cherry', P: 'pine', I: 'iris' };
const SYM_FROM: Record<string, Symbol> = { s: 'sun', p: 'poem', b: 'bird', r: 'rain' };

/** Two-letter code, e.g. "Cb" = cherry + bird. */
export function tileCode(t: Tile): string {
  return VEG_CODE[t.veg] + SYM_CODE[t.sym];
}

export function parseTile(code: string): Tile {
  const veg = VEG_FROM[code[0]];
  const sym = SYM_FROM[code[1]];
  if (!veg || !sym || code.length !== 2) throw new Error(`bad tile code ${code}`);
  return { veg, sym };
}

/** Parse a 16-token layout like "Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir". */
export function parseLayout(layout: string): Tile[] {
  return layout.trim().split(/\s+/).map(parseTile);
}

/** Render the board as 4 lines of 4 codes; tokens show as "1." / "2.". */
export function boardToString(board: readonly Cell[]): string {
  const lines: string[] = [];
  for (let r = 0; r < 4; r++) {
    const parts: string[] = [];
    for (let c = 0; c < 4; c++) {
      const cell = board[indexOf(r, c)];
      parts.push(cell.kind === 'tile' ? tileCode(cell.tile) : `${cell.player}.`);
    }
    lines.push(parts.join(' '));
  }
  return lines.join('\n');
}

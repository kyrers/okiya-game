/**
 * A match as the app plays it: who sits where, which end-of-game format, and every game so far.
 *
 * The saved form keeps only facts (the setup, each garden, who opened it, the moves taken). The
 * rest (scores, who opens next, whether the match is over) is always re-derived by replaying the
 * games through the rules engine, so a saved match can never disagree with the rules.
 */
import { isDifficulty, type Difficulty } from '../engine/ai';
import {
  CELL_COUNT,
  allTiles,
  applyMove,
  isMatchMode,
  isPlayer,
  isTile,
  mulberry32,
  newGameFromTiles,
  newMatch,
  opponent,
  recordGame,
  shuffle,
  type GameState,
  type MatchMode,
  type MatchState,
  type Player,
  type Tile,
} from '../engine/okiya';

export type Opponent = 'human' | 'computer';

export interface MatchSetup {
  readonly opponent: Opponent;
  /** Used when the opponent is the computer. */
  readonly difficulty: Difficulty;
  readonly mode: MatchMode;
  /** Display names for player 1 and player 2. */
  readonly names: readonly [string, string];
}

/** In a game against the computer, the person is player 1 and the computer player 2. */
export const HUMAN_SEAT: Player = 1;
export const COMPUTER_SEAT: Player = 2;

export interface GameRecord {
  /** The 16 garden tiles in board order, as laid out when the game started. */
  readonly tiles: readonly Tile[];
  readonly first: Player;
  /** Board indices taken, in order. */
  readonly moves: readonly number[];
}

export interface SavedMatch {
  readonly version: 1;
  readonly setup: MatchSetup;
  /** Every game of the match, the last one possibly still in progress. */
  readonly games: readonly GameRecord[];
}

/** Everything the screen needs, derived from a SavedMatch. */
export interface MatchView {
  readonly saved: SavedMatch;
  /** The match score before the current game (or after it, once it is over). */
  readonly match: MatchState;
  /** The current (last) game. */
  readonly game: GameState;
  /** Number of the current game, starting at 1. */
  readonly gameNumber: number;
}

export const NAME_MAX = 16;

export function isComputer(setup: MatchSetup, p: Player): boolean {
  return setup.opponent === 'computer' && p === COMPUTER_SEAT;
}

export function randomLayout(rng: () => number): Tile[] {
  return shuffle(allTiles(), rng);
}

/** A fresh match. The first player of the first game is chosen at random (PDF). */
export function startMatch(setup: MatchSetup, rng: () => number = Math.random): MatchView {
  const first: Player = rng() < 0.5 ? 1 : 2;
  const saved: SavedMatch = { version: 1, setup: cleanSetup(setup), games: [{ tiles: randomLayout(rng), first, moves: [] }] };
  return derive(saved);
}

/** Take the tile at `index` in the current game. Throws if the move is illegal. */
export function play(view: MatchView, index: number): MatchView {
  const next = applyMove(view.game, index);
  const games = view.saved.games.slice();
  const last = games[games.length - 1];
  games[games.length - 1] = { ...last, moves: [...last.moves, index] };
  const saved = { ...view.saved, games };
  return { saved, game: next, gameNumber: view.gameNumber, match: next.result ? recordGame(view.match, next.result) : view.match };
}

/**
 * Take back moves in the current game until `seat` is to move again, at least one move back.
 * Returns null when there is nothing to take back. Not allowed once the game is over.
 */
export function undo(view: MatchView, seat: Player | null): MatchView | null {
  if (view.game.result) return null;
  const last = view.saved.games[view.saved.games.length - 1];
  let moves = last.moves.slice();
  if (moves.length === 0) return null;
  moves.pop();
  if (seat !== null) {
    while (moves.length > 0 && whoMoves(last, moves.length) !== seat) moves.pop();
    if (whoMoves(last, moves.length) !== seat) return null;
  }
  const games = view.saved.games.slice(0, -1).concat({ ...last, moves });
  return derive({ ...view.saved, games });
}

function whoMoves(g: GameRecord, ply: number): Player {
  return ply % 2 === 0 ? g.first : opponent(g.first);
}

/** Start the next game of a match whose current game is over. The loser opens (PDF). */
export function nextGame(view: MatchView, rng: () => number = Math.random): MatchView {
  if (!view.game.result) throw new Error('the current game is not over');
  if (view.match.over) throw new Error('the match is over');
  const games = view.saved.games.concat({ tiles: randomLayout(rng), first: view.match.nextFirst, moves: [] });
  return derive({ ...view.saved, games });
}

/** Replay a saved match through the engine. Throws if anything in it is not a legal Okiya match. */
export function derive(saved: SavedMatch): MatchView {
  if (saved.games.length === 0) throw new Error('a match has at least one game');
  let match = newMatch(saved.setup.mode, saved.games[0].first);
  let game: GameState | null = null;
  saved.games.forEach((g, i) => {
    if (match.over) throw new Error(`game ${i + 1} was played after the match was over`);
    if (g.first !== match.nextFirst) throw new Error(`game ${i + 1} was opened by the wrong player`);
    let s = newGameFromTiles(g.tiles, g.first);
    for (const m of g.moves) s = applyMove(s, m);
    const last = i === saved.games.length - 1;
    if (!last && !s.result) throw new Error(`game ${i + 1} is unfinished but a later game exists`);
    if (s.result) match = recordGame(match, s.result);
    game = s;
  });
  return { saved, match, game: game!, gameNumber: saved.games.length };
}

function cleanName(x: unknown, fallback: string): string {
  if (typeof x !== 'string') return fallback;
  const t = x.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return t.length ? t : fallback;
}

export function defaultNames(opponentKind: Opponent): [string, string] {
  return opponentKind === 'computer' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
}

function cleanSetup(setup: MatchSetup): MatchSetup {
  const d = defaultNames(setup.opponent);
  const names: [string, string] =
    setup.opponent === 'computer' ? d : [cleanName(setup.names[0], d[0]), cleanName(setup.names[1], d[1])];
  return { opponent: setup.opponent, difficulty: setup.difficulty, mode: setup.mode, names };
}

/**
 * Parse untrusted data (from storage) into a SavedMatch and replay it. Returns null for anything
 * that is not a complete, legal match.
 */
export function restore(data: unknown): MatchView | null {
  try {
    if (!isRecord(data) || data.version !== 1 || !isRecord(data.setup) || !Array.isArray(data.games)) return null;
    const st = data.setup;
    if (st.opponent !== 'human' && st.opponent !== 'computer') return null;
    if (!isDifficulty(st.difficulty) || !isMatchMode(st.mode)) return null;
    if (!Array.isArray(st.names) || st.names.length !== 2) return null;
    const setup = cleanSetup({ opponent: st.opponent, difficulty: st.difficulty, mode: st.mode, names: [String(st.names[0]), String(st.names[1])] });
    if (data.games.length === 0 || data.games.length > 500) return null;
    const games: GameRecord[] = [];
    for (const g of data.games as unknown[]) {
      if (!isRecord(g) || !isPlayer(g.first) || !Array.isArray(g.tiles) || !Array.isArray(g.moves)) return null;
      if (g.tiles.length !== CELL_COUNT || !g.tiles.every(isTile)) return null;
      if (g.moves.length > CELL_COUNT || !g.moves.every((m) => Number.isInteger(m) && m >= 0 && m < CELL_COUNT)) return null;
      games.push({ tiles: g.tiles.map((t: Tile) => ({ veg: t.veg, sym: t.sym })), first: g.first, moves: g.moves.slice() });
    }
    return derive({ version: 1, setup, games });
  } catch {
    return null;
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** Deterministic rng for tests and seeded play. */
export function seededRng(seed: number): () => number {
  return mulberry32(seed);
}

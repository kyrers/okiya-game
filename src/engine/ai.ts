/**
 * AI opponent for Okiya: negamax with alpha-beta pruning, a transposition
 * table and iterative deepening. Pure functions; deterministic given a PRNG.
 *
 * Scores are from the point of view of the player to move:
 *   +WIN - plies  : the mover wins (sooner is better)
 *   -WIN + plies  : the mover loses (later is better)
 *   0             : a tie (full garden)
 *   heuristic     : otherwise (see evaluate())
 */
import {
  CELL_COUNT,
  FORMATIONS,
  applyMove,
  legalMoves,
  mulberry32,
  tileCode,
  type Cell,
  type GameState,
  type Player,
} from './okiya';

export const WIN = 10_000;

export interface AiOptions {
  /** Maximum search depth in plies (0 = evaluate immediately). */
  depth: number;
  /** Probability (0..1) of playing a random legal move instead of the best one. Adds "human" error. */
  blunder?: number;
  /**
   * When true, blunders and shallow misjudgements may hand the opponent an immediate win
   * (the easiest level). Default false: the AI always takes an immediate win, and never
   * plays a move after which the opponent can win at once when a safer move exists. Blunders
   * are then drawn from the safe moves only.
   */
  careless?: boolean;
  /** PRNG in [0,1); defaults to a fixed-seed mulberry32. */
  rng?: () => number;
  /** Optional wall-clock budget in ms for iterative deepening (overrides depth as an upper bound). */
  timeMs?: number;
}

export interface AiResult {
  index: number;
  score: number;
  depth: number;
  nodes: number;
  /** Scores of all legal moves at the final completed depth (same order as `moves`). */
  moves: number[];
  scores: number[];
}

/**
 * Static evaluation from the point of view of `me`. Counts "live" formations:
 * formations containing no opponent token, weighted by how many of my tokens
 * already sit in them. Mobility (number of legal replies) is a small bonus.
 */
export function evaluate(state: GameState, me: Player): number {
  const board = state.board;
  let score = 0;
  for (const f of FORMATIONS) {
    let mine = 0;
    let theirs = 0;
    for (const i of f.cells) {
      const c = board[i];
      if (c.kind === 'token') {
        if (c.player === me) mine++;
        else theirs++;
      }
    }
    if (mine > 0 && theirs === 0) score += WEIGHTS[mine];
    else if (theirs > 0 && mine === 0) score -= WEIGHTS[theirs];
  }
  const mobility = legalMoves(state).length;
  score += state.current === me ? mobility : -mobility;
  return score;
}

const WEIGHTS = [0, 1, 6, 30, 1000];

function key(state: GameState): string {
  let s = '';
  for (let i = 0; i < CELL_COUNT; i++) {
    const c: Cell = state.board[i];
    s += c.kind === 'tile' ? '.' : c.player;
  }
  return s + (state.lastTile ? tileCode(state.lastTile) : '--') + state.current;
}

interface TTEntry {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // exact, lower bound, upper bound
}

export class Searcher {
  nodes = 0;
  private tt = new Map<string, TTEntry>();
  private deadline = Infinity;
  aborted = false;

  /** @param maxTableSize transposition table cap */
  constructor(private readonly maxTableSize = 2_000_000) {}

  reset(): void {
    this.tt.clear();
    this.nodes = 0;
    this.aborted = false;
  }

  negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if (state.result) {
      // A tie scores 0; otherwise the previous mover won, so the player to move has lost.
      return state.result.winner === null ? 0 : -(WIN - ply);
    }
    if (depth === 0) return evaluate(state, state.current);
    if ((this.nodes & 1023) === 0 && performance.now() > this.deadline) {
      this.aborted = true;
      return 0;
    }

    const k = key(state);
    const hit = this.tt.get(k);
    const alpha0 = alpha;
    if (hit && hit.depth >= depth) {
      if (hit.flag === 0) return hit.score;
      if (hit.flag === 1) alpha = Math.max(alpha, hit.score);
      else beta = Math.min(beta, hit.score);
      if (alpha >= beta) return hit.score;
    }

    const moves = orderMoves(state, legalMoves(state));
    let best = -Infinity;
    for (const m of moves) {
      const next = applyMove(state, m);
      const v = -this.negamax(next, depth - 1, -beta, -alpha, ply + 1);
      if (this.aborted) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }

    if (this.tt.size < this.maxTableSize) {
      const flag: TTEntry['flag'] = best <= alpha0 ? 2 : best >= beta ? 1 : 0;
      this.tt.set(k, { depth, score: best, flag });
    }
    return best;
  }

  /** Search every root move to `depth`; returns scores aligned with `moves`. */
  rootSearch(state: GameState, moves: number[], depth: number): number[] | null {
    const scores: number[] = [];
    for (const m of moves) {
      const next = applyMove(state, m);
      const v = -this.negamax(next, depth - 1, -Infinity, Infinity, 1);
      if (this.aborted) return null;
      scores.push(v);
    }
    return scores;
  }

  setDeadline(ms: number): void {
    this.deadline = Number.isFinite(ms) ? performance.now() + ms : Infinity;
  }
}

/** Winning moves first, then moves that leave the opponent fewer replies. Cheap and effective. */
function orderMoves(state: GameState, moves: number[]): number[] {
  if (moves.length <= 1) return moves;
  const scored = moves.map((m) => {
    const next = applyMove(state, m);
    if (next.result?.winner) return { m, s: WIN };
    return { m, s: -legalMoves(next).length };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

const defaultRng = mulberry32(12345);

/**
 * One-ply tactics for every legal move: does it win at once, and does it let the opponent win
 * at once (by a formation or by blocking us)?
 */
export function tactics(state: GameState): { moves: number[]; wins: boolean[]; losesNext: boolean[] } {
  const moves = legalMoves(state);
  const wins: boolean[] = [];
  const losesNext: boolean[] = [];
  for (const m of moves) {
    const next = applyMove(state, m);
    if (next.result) {
      wins.push(next.result.winner === state.current);
      losesNext.push(false);
      continue;
    }
    wins.push(false);
    losesNext.push(legalMoves(next).some((r) => applyMove(next, r).result?.winner === next.current));
  }
  return { moves, wins, losesNext };
}

/**
 * Choose a move for the player to move. Iterative deepening up to
 * `opts.depth` plies (or until `opts.timeMs` elapses). Equal scores are broken at
 * random with `opts.rng` so games are varied.
 */
export function chooseMove(state: GameState, opts: AiOptions, searcher = new Searcher()): AiResult {
  const rng = opts.rng ?? defaultRng;
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('no legal moves');

  // Tactical guard (careful rivals): take an immediate win; otherwise only consider moves that
  // do not hand the opponent an immediate win, when such moves exist.
  let allowed = moves;
  if (!opts.careless) {
    const t = tactics(state);
    const winning = moves.filter((_, i) => t.wins[i]);
    if (winning.length) {
      const index = winning[Math.floor(rng() * winning.length)];
      return { index, score: WIN - 1, depth: 0, nodes: 0, moves, scores: moves.map((_, i) => (t.wins[i] ? WIN - 1 : 0)) };
    }
    const safe = moves.filter((_, i) => !t.losesNext[i]);
    if (safe.length) allowed = safe;
  }

  if (opts.blunder && rng() < opts.blunder) {
    const index = allowed[Math.floor(rng() * allowed.length)];
    return { index, score: 0, depth: 0, nodes: 0, moves, scores: moves.map(() => 0) };
  }

  searcher.reset();
  searcher.setDeadline(opts.timeMs ?? Infinity);
  let bestScores: number[] = moves.map((m) => evaluate(applyMove(state, m), state.current));
  // Immediate wins (and ties) are always visible, even at depth 0.
  moves.forEach((m, i) => {
    const r = applyMove(state, m).result;
    if (r) bestScores[i] = r.winner === null ? 0 : WIN - 1;
  });
  let completedDepth = 0;
  for (let d = 1; d <= opts.depth; d++) {
    const scores = searcher.rootSearch(state, moves, d);
    if (!scores) break;
    bestScores = scores;
    completedDepth = d;
    // Stop early once the outcome is decided.
    if (Math.max(...scores) >= WIN - 20 || Math.min(...scores) <= -(WIN - 20) && Math.max(...scores) <= -(WIN - 20)) break;
  }
  const allowedScores = moves.map((m, i) => (allowed.includes(m) ? bestScores[i] : -Infinity));
  const max = Math.max(...allowedScores);
  const candidates = moves.filter((_, i) => allowedScores[i] === max);
  const index = candidates[Math.floor(rng() * candidates.length)];
  return { index, score: max, depth: completedDepth, nodes: searcher.nodes, moves, scores: bestScores };
}

/** Difficulty levels offered in the game. Calibrated by simulation: see docs/PROCESS.md. */
export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export function isDifficulty(x: unknown): x is Difficulty {
  return typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);
}

export const DIFFICULTY: Record<Difficulty, AiOptions> = {
  easy: { depth: 1, blunder: 0.35, careless: true },
  medium: { depth: 3, blunder: 0.1 },
  hard: { depth: 5 },
};

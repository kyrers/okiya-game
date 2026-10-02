/**
 * Hanamichi charm layer. Charms are PURE functions that read a finished
 * Okiya game (and its move history) and return extra petals. They never
 * touch legalMoves/applyMove, so every game is still exactly Okiya.
 *
 * Petals for a game won by `me`:
 *   (BASE + tilesRemaining + Σ add) × (1 + Σ mult)
 * A lost game scores 0 petals.
 */
import {
  CENTRE_CELLS,
  applyMove,
  legalMoves,
  newGameFromTiles,
  type GameState,
  type Player,
  type Tile,
} from './okiya';

export const BASE_PETALS = 3;

export type CharmId =
  | 'stone-lantern'
  | 'bamboo-fence'
  | 'crane-scroll'
  | 'thorn-hedge'
  | 'corner-shrine'
  | 'heart-stone'
  | 'rain-chain'
  | 'narrow-gate'
  | 'steady-hand'
  | 'swift-blossom';

export interface CharmEffect {
  add: number;
  mult: number;
  /** Short human explanation of what fired, e.g. "3 corners held". Empty if nothing fired. */
  note: string;
}

export interface Charm {
  id: CharmId;
  name: string;
  /** One-line rule text shown to the player. */
  rule: string;
  /** Emoji-free glyph key for the UI. */
  glyph: 'square' | 'line' | 'diagonal' | 'block' | 'corner' | 'centre' | 'symbol' | 'gate' | 'tokens' | 'fast';
  score(ctx: GameContext): CharmEffect;
}

/** Everything a charm may read: the finished game and derived per-move facts. */
export interface GameContext {
  state: GameState;
  me: Player;
  /** My moves, in order. */
  myMoves: { index: number; tile: Tile; matchedBy: 'first' | 'vegetation' | 'symbol'; repliesLeft: number }[];
}

/** Build the context by replaying the history through the unmodified engine. */
export function buildContext(state: GameState, me: Player): GameContext {
  const tiles = reconstructLayout(state);
  const first = state.history[0]?.player ?? 1;
  let g = newGameFromTiles(tiles, first);
  const myMoves: GameContext['myMoves'] = [];
  for (const m of state.history) {
    const prev = g.lastTile;
    g = applyMove(g, m.index);
    if (m.player === me) {
      const matchedBy: 'first' | 'vegetation' | 'symbol' = prev === null ? 'first' : prev.veg === m.tile.veg ? 'vegetation' : 'symbol';
      myMoves.push({ index: m.index, tile: m.tile, matchedBy, repliesLeft: g.win ? 0 : legalMoves(g).length });
    }
  }
  return { state, me, myMoves };
}

/** Recover the initial tile layout from a state (tiles still on the board + tiles in the history). */
export function reconstructLayout(state: GameState): Tile[] {
  const tiles: Tile[] = new Array(16);
  state.board.forEach((c, i) => {
    if (c.kind === 'tile') tiles[i] = c.tile;
  });
  for (const m of state.history) tiles[m.index] = m.tile;
  return tiles;
}

const none: CharmEffect = { add: 0, mult: 0, note: '' };

function won(ctx: GameContext): boolean {
  return ctx.state.win?.winner === ctx.me;
}

function myTokenCount(ctx: GameContext): number {
  return ctx.state.board.filter((c) => c.kind === 'token' && c.player === ctx.me).length;
}

export const CHARMS: readonly Charm[] = [
  {
    id: 'stone-lantern',
    name: 'Stone Lantern',
    rule: 'Win with a 2×2 square: +6 petals.',
    glyph: 'square',
    score: (ctx) => (won(ctx) && ctx.state.win!.reason === 'square' ? { add: 6, mult: 0, note: 'square win' } : none),
  },
  {
    id: 'bamboo-fence',
    name: 'Bamboo Fence',
    rule: 'Win with a row or a column: +4 petals.',
    glyph: 'line',
    score: (ctx) =>
      won(ctx) && (ctx.state.win!.reason === 'row' || ctx.state.win!.reason === 'column') ? { add: 4, mult: 0, note: `${ctx.state.win!.reason} win` } : none,
  },
  {
    id: 'crane-scroll',
    name: 'Crane Scroll',
    rule: 'Win on a diagonal: +8 petals.',
    glyph: 'diagonal',
    score: (ctx) => (won(ctx) && ctx.state.win!.reason === 'diagonal' ? { add: 8, mult: 0, note: 'diagonal win' } : none),
  },
  {
    id: 'thorn-hedge',
    name: 'Thorn Hedge',
    rule: 'Win by blocking the rival: +4 petals.',
    glyph: 'block',
    score: (ctx) => (won(ctx) && ctx.state.win!.reason === 'blocked' ? { add: 4, mult: 0, note: 'rival blocked' } : none),
  },
  {
    id: 'corner-shrine',
    name: 'Corner Shrine',
    rule: '+2 petals for each corner you hold when you win.',
    glyph: 'corner',
    score: (ctx) => {
      if (!won(ctx)) return none;
      const n = [0, 3, 12, 15].filter((i) => ctx.state.board[i].kind === 'token' && (ctx.state.board[i] as { player: Player }).player === ctx.me).length;
      return n ? { add: 2 * n, mult: 0, note: `${n} corner${n > 1 ? 's' : ''} held` } : none;
    },
  },
  {
    id: 'heart-stone',
    name: 'Heart Stone',
    rule: '+2 petals for each centre cell you hold when you win.',
    glyph: 'centre',
    score: (ctx) => {
      if (!won(ctx)) return none;
      const n = CENTRE_CELLS.filter((i) => ctx.state.board[i].kind === 'token' && (ctx.state.board[i] as { player: Player }).player === ctx.me).length;
      return n ? { add: 2 * n, mult: 0, note: `${n} centre cell${n > 1 ? 's' : ''} held` } : none;
    },
  },
  {
    id: 'rain-chain',
    name: 'Rain Chain',
    rule: '+1 petal for each of your moves that followed the constraint by symbol.',
    glyph: 'symbol',
    score: (ctx) => {
      if (!won(ctx)) return none;
      const n = ctx.myMoves.filter((m) => m.matchedBy === 'symbol').length;
      return n ? { add: n, mult: 0, note: `${n} symbol match${n > 1 ? 'es' : ''}` } : none;
    },
  },
  {
    id: 'narrow-gate',
    name: 'Narrow Gate',
    rule: '+3 petals each time you leave the rival exactly one legal tile.',
    glyph: 'gate',
    score: (ctx) => {
      if (!won(ctx)) return none;
      const n = ctx.myMoves.filter((m) => m.repliesLeft === 1).length;
      return n ? { add: 3 * n, mult: 0, note: `${n} narrow gate${n > 1 ? 's' : ''}` } : none;
    },
  },
  {
    id: 'steady-hand',
    name: 'Steady Hand',
    rule: '+1 petal for every two tokens you placed.',
    glyph: 'tokens',
    score: (ctx) => {
      if (!won(ctx)) return none;
      const n = Math.floor(myTokenCount(ctx) / 2);
      return n ? { add: n, mult: 0, note: `${myTokenCount(ctx)} tokens placed` } : none;
    },
  },
  {
    id: 'swift-blossom',
    name: 'Swift Blossom',
    rule: 'Win with 6 tokens or fewer on the board: petals ×2.',
    glyph: 'fast',
    score: (ctx) => (won(ctx) && myTokenCount(ctx) <= 6 ? { add: 0, mult: 1, note: `won with ${myTokenCount(ctx)} tokens` } : none),
  },
];

export const CHARM_BY_ID: Record<CharmId, Charm> = Object.fromEntries(CHARMS.map((c) => [c.id, c])) as Record<CharmId, Charm>;

export interface PetalBreakdown {
  won: boolean;
  base: number;
  tilesRemaining: number;
  effects: { charm: Charm; effect: CharmEffect }[];
  add: number;
  mult: number;
  total: number;
}

/** Score a finished game for `me` under the held charms. */
export function scoreGame(state: GameState, me: Player, held: readonly CharmId[]): PetalBreakdown {
  if (!state.win) throw new Error('game not finished');
  const ctx = buildContext(state, me);
  const effects = held.map((id) => ({ charm: CHARM_BY_ID[id], effect: CHARM_BY_ID[id].score(ctx) }));
  if (state.win.winner !== me) {
    return { won: false, base: 0, tilesRemaining: state.win.tilesRemaining, effects, add: 0, mult: 0, total: 0 };
  }
  const add = effects.reduce((n, e) => n + e.effect.add, 0);
  const mult = effects.reduce((n, e) => n + e.effect.mult, 0);
  const total = (BASE_PETALS + state.win.tilesRemaining + add) * (1 + mult);
  return { won: true, base: BASE_PETALS, tilesRemaining: state.win.tilesRemaining, effects, add, mult, total };
}

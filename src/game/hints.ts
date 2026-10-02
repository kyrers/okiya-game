/**
 * Information-only helpers for the UI. None of these change what is legal.
 */
import { BASE_PETALS, CHARM_BY_ID, buildContext, scoreGame, type CharmId } from '../engine/charms';
import { CENTRE_CELLS, applyMove, legalMoves, tilesRemaining, type GameState, type Player } from '../engine/okiya';

export type FireflyHint = 'win' | 'danger' | 'safe';

/** Firefly: for each legal tile, does it win at once, or hand the rival an immediate win? */
export function fireflyHints(state: GameState, me: Player): Map<number, FireflyHint> {
  const out = new Map<number, FireflyHint>();
  if (state.current !== me || state.win) return out;
  for (const m of legalMoves(state)) {
    const next = applyMove(state, m);
    if (next.win) {
      out.set(m, next.win.winner === me ? 'win' : 'danger');
      continue;
    }
    const rivalWins = legalMoves(next).some((r) => applyMove(next, r).win?.winner !== undefined && applyMove(next, r).win!.winner !== me);
    out.set(m, rivalWins ? 'danger' : 'safe');
  }
  return out;
}

/**
 * "Worth now": what a win on my NEXT move would pay. A win needs at least one more tile
 * taken (one on my turn, two when the rival is to move), so the tile count is reduced
 * accordingly. If a legal move wins at once, the exact best payout over those moves is used.
 * Otherwise the estimate counts the base, the tiles that would be left and the position-based
 * charms (corners, centre, symbol matches, gates, tokens); win-type charms and Swift Blossom
 * are listed separately as conditional.
 */
export interface Worth {
  base: number;
  tiles: number;
  adds: { id: CharmId; add: number }[];
  total: number;
  conditional: CharmId[];
  /** True when `total` is the exact payout of a winning move available right now. */
  exact: boolean;
}

export function worthNow(state: GameState, me: Player, held: readonly CharmId[]): Worth {
  if (!state.win && state.current === me) {
    let best: Worth | null = null;
    for (const m of legalMoves(state)) {
      const next = applyMove(state, m);
      if (next.win && next.win.winner === me) {
        const s = scoreGame(next, me, held);
        if (!best || s.total > best.total) {
          best = { base: s.base, tiles: s.tilesRemaining, adds: s.effects.filter((e) => e.effect.add).map((e) => ({ id: e.charm.id, add: e.effect.add })), total: s.total, conditional: [], exact: true };
        }
      }
    }
    if (best) return best;
  }
  const now = tilesRemaining(state.board);
  const tiles = Math.max(0, now - (state.current === me ? 1 : 2));
  const fake: GameState = { ...state, win: { winner: me, reason: 'row' as never, cells: [], tilesRemaining: tiles } };
  // Use a reason no win-type charm matches so only position charms fire.
  (fake.win as { reason: string }).reason = 'none';
  const ctx = buildContext(fake, me);
  const adds: Worth['adds'] = [];
  const conditional: CharmId[] = [];
  for (const id of held) {
    if (['stone-lantern', 'bamboo-fence', 'crane-scroll', 'thorn-hedge', 'swift-blossom'].includes(id)) {
      conditional.push(id);
      continue;
    }
    const e = CHARM_BY_ID[id].score(ctx);
    if (e.add) adds.push({ id, add: e.add });
  }
  const total = BASE_PETALS + tiles + adds.reduce((n, a) => n + a.add, 0);
  return { base: BASE_PETALS, tiles, adds, total, conditional, exact: false };
}

/** Per-cell CSS hints for held charms (corner/centre cells, symbol matches, narrow gates). */
export function charmCellClasses(state: GameState, me: Player, held: readonly CharmId[]): (index: number) => string {
  const legal = state.current === me && !state.win ? new Set(legalMoves(state)) : new Set<number>();
  const symbolMatch = new Set<number>();
  const gate = new Set<number>();
  if (held.includes('rain-chain') && state.lastTile) {
    for (const m of legal) {
      const c = state.board[m];
      if (c.kind === 'tile' && c.tile.sym === state.lastTile.sym) symbolMatch.add(m);
    }
  }
  if (held.includes('narrow-gate')) {
    for (const m of legal) {
      const next = applyMove(state, m);
      if (!next.win && legalMoves(next).length === 1) gate.add(m);
    }
  }
  return (i: number) => {
    const cls: string[] = [];
    if (held.includes('corner-shrine') && [0, 3, 12, 15].includes(i)) cls.push('hint-corner');
    if (held.includes('heart-stone') && CENTRE_CELLS.includes(i)) cls.push('hint-centre');
    if (symbolMatch.has(i)) cls.push('hint-symbol');
    if (gate.has(i)) cls.push('hint-gate');
    return cls.join(' ');
  };
}

import { describe, expect, it } from 'vitest';
import { BASE_PETALS, CHARMS, CHARM_BY_ID, buildContext, reconstructLayout, scoreGame } from './charms';
import { applyMove, newGameFromTiles, parseLayout, type GameState } from './okiya';

const CANON = 'Ms Mp Mb Mr  Cs Cp Cb Cr  Ps Pp Pb Pr  Is Ip Ib Ir';

/** The 13-move game from okiya.test.ts: P1 wins the top row with 3 tiles left. */
function rowGame(): GameState {
  let g = newGameFromTiles(parseLayout(CANON));
  for (const m of [0, 4, 5, 9, 1, 13, 14, 10, 2, 6, 7, 11, 3]) g = applyMove(g, m);
  return g;
}

/** A blocked win: P1 takes Ms at index 0 and P2 has no reply (3 tiles left). */
function blockedGame(): GameState {
  // Build by playing a real game so history is consistent:
  // layout chosen so that the sequence is legal and ends in a block.
  let g = newGameFromTiles(parseLayout('Ms Cp Mb Mr  Cs Pb Cb Cr  Ps Pp Ip Pr  Is Mp Ib Ir'));
  // P1 Mr(3) P2 Cr(7) P1 Cs(4) P2 Ps(8) P1 Pr(11) P2 Ir(15) P1 Is(12) P2 Ib(14) P1 Cb(6) P2 Mb(2) P1 Mp(13) P2 Pp(9) -> last Pp
  for (const m of [3, 7, 4, 8, 11, 15, 12, 14, 6, 2, 13, 9]) g = applyMove(g, m);
  return g;
}

describe('charm layer is pure and reads the finished game only', () => {
  it('reconstructs the starting layout from a finished game', () => {
    const g = rowGame();
    expect(reconstructLayout(g)).toEqual(parseLayout(CANON));
  });

  it('builds per-move context: how each of my moves matched the constraint and replies left', () => {
    const ctx = buildContext(rowGame(), 1);
    expect(ctx.myMoves.map((m) => m.matchedBy)).toEqual(['first', 'vegetation', 'symbol', 'vegetation', 'symbol', 'vegetation', 'symbol']);
    expect(ctx.myMoves.map((m) => m.index)).toEqual([0, 5, 1, 14, 2, 7, 3]);
    expect(ctx.myMoves[6].repliesLeft).toBe(0); // game over after the winning move
  });

  it('a lost game scores 0 petals whatever the charms', () => {
    const s = scoreGame(rowGame(), 2, ['corner-shrine', 'steady-hand', 'rain-chain']);
    expect(s.won).toBe(false);
    expect(s.total).toBe(0);
  });

  it('refuses to score an unfinished game', () => {
    expect(() => scoreGame(newGameFromTiles(parseLayout(CANON)), 1, [])).toThrow(/not finished/);
  });
});

describe('petal formula (BASE + tiles remaining + adds) × (1 + mults)', () => {
  it('no charms: base + tiles remaining', () => {
    const s = scoreGame(rowGame(), 1, []);
    expect(BASE_PETALS).toBe(3);
    expect(s.tilesRemaining).toBe(3);
    expect(s.total).toBe(6);
  });

  it('Bamboo Fence fires on a row win (+4), Stone Lantern does not', () => {
    const s = scoreGame(rowGame(), 1, ['bamboo-fence', 'stone-lantern']);
    expect(s.effects.map((e) => e.effect.add)).toEqual([4, 0]);
    expect(s.total).toBe(3 + 3 + 4);
  });

  it('Corner Shrine counts the corners I hold: indices 0 and 3 in the row game → +4', () => {
    const s = scoreGame(rowGame(), 1, ['corner-shrine']);
    expect(s.effects[0].effect).toEqual({ add: 4, mult: 0, note: '2 corners held' });
    expect(s.total).toBe(10);
  });

  it('Heart Stone counts centre cells: I hold index 5 only → +2', () => {
    const s = scoreGame(rowGame(), 1, ['heart-stone']);
    expect(s.effects[0].effect).toEqual({ add: 2, mult: 0, note: '1 centre cell held' });
  });

  it('Rain Chain counts my moves that followed the constraint by symbol (3 in the row game)', () => {
    const s = scoreGame(rowGame(), 1, ['rain-chain']);
    expect(s.effects[0].effect).toEqual({ add: 3, mult: 0, note: '3 symbol matches' });
    expect(s.total).toBe(9);
  });

  it('Steady Hand: +1 per two tokens placed (7 tokens → +3)', () => {
    const s = scoreGame(rowGame(), 1, ['steady-hand']);
    expect(s.effects[0].effect).toEqual({ add: 3, mult: 0, note: '7 tokens placed' });
  });

  it('Swift Blossom doubles petals when winning with 6 tokens or fewer; 7 tokens is too slow', () => {
    expect(scoreGame(rowGame(), 1, ['swift-blossom']).total).toBe(6);
  });

  it('multipliers apply after adds: (3 + 3 + 4) × 2 = 20', () => {
    // Fabricate a quick win: P1 wins a 2x2 square in 7 moves (4 tokens).
    let g = newGameFromTiles(parseLayout(CANON));
    // P1 Ms(0) P2 Mr(3) P1 Cr(7)?? shares rain -> idx 7 Cr. P2 Cb(6) shares cherry. P1 Cs(4)? shares cherry. P2 Ps(8) shares sun. P1 Cp(5) shares... Ps vs Cp: no. Use P1 Pp(9) shares pine.
    for (const m of [0, 3, 7, 6, 4, 8]) g = applyMove(g, m);
    // Board: P1 at 0,7,4; P2 at 3,6,8. Last tile Ps. P1 needs 1 and 5 for square 0,1,4,5. Take Mp(1)? Ps shares nothing with Mp. Take Cp(5)? no. So play on: P1 Is(12) shares sun.
    g = applyMove(g, 12); // P1 Is
    g = applyMove(g, 13); // P2 Ip (iris)
    g = applyMove(g, 5); // P1 Cp (poem) -> P1 at 0,7,4,12,5
    g = applyMove(g, 9); // P2 Pp (poem)
    g = applyMove(g, 1); // P1 Mp (poem) -> square 0,1,4,5 complete with 6 tokens
    expect(g.win).toEqual({ winner: 1, reason: 'square', cells: [0, 1, 4, 5], tilesRemaining: 5 });
    const s = scoreGame(g, 1, ['stone-lantern', 'swift-blossom']);
    expect(s.add).toBe(6);
    expect(s.mult).toBe(1);
    expect(s.total).toBe((3 + 5 + 6) * 2);
  });

  it('Thorn Hedge and Narrow Gate fire on blocked wins and single-reply moves', () => {
    const g = blockedGame();
    expect(g.win).toBeNull();
    // P1 to move, last tile Pp. Legal: Ms? no. Cp(1) shares poem. Pb(5) shares pine. Ip(10) poem.
    const after = applyMove(g, 1); // P1 takes Cp: remaining Ms, Pb, Ip -> none shares cherry or poem? Ip shares poem!
    expect(after.win).toBeNull();
    const after2 = applyMove(after, 10); // P2 takes Ip (poem). Remaining Ms, Pb: Ms shares? Ip: iris/poem -> no; Pb no -> P1 blocked, P2 wins
    expect(after2.win).toEqual({ winner: 2, reason: 'blocked', cells: [], tilesRemaining: 2 });
    const s = scoreGame(after2, 2, ['thorn-hedge', 'narrow-gate']);
    expect(s.effects[0].effect).toEqual({ add: 4, mult: 0, note: 'rival blocked' });
    // P2's moves and the replies they left: count moves leaving exactly one legal reply.
    const ctx = buildContext(after2, 2);
    const gates = ctx.myMoves.filter((m) => m.repliesLeft === 1).length;
    expect(s.effects[1].effect.add).toBe(3 * gates);
    expect(s.total).toBe(3 + 2 + 4 + 3 * gates);
  });
});

describe('charm catalogue', () => {
  it('has 10 distinct charms with rules text', () => {
    expect(CHARMS).toHaveLength(10);
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(10);
    for (const c of CHARMS) {
      expect(c.rule.length).toBeGreaterThan(10);
      expect(CHARM_BY_ID[c.id]).toBe(c);
    }
  });
});

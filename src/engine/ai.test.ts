import { describe, expect, it } from 'vitest';
import { WIN, chooseMove, evaluate } from './ai';
import { applyMove, mulberry32, newGame, newGameFromTiles, parseLayout, parseTile } from './okiya';
import { stateFromPicture } from './testUtils';

describe('AI basics', () => {
  it('takes an immediate winning move', () => {
    // P1 to move, last tile Ib; Ps (index 8) completes column 0.
    const s = stateFromPicture(
      `1  Mp Mb Mr
       1  Cp Cb Cr
       Ps 2  2  2
       1  Ip Pb Ir`,
      1,
      parseTile('Is'),
    );
    const r = chooseMove(s, { depth: 1 });
    expect(r.index).toBe(8);
    expect(r.score).toBeGreaterThanOrEqual(WIN - 20);
  });

  it('blocks an immediate threat when it cannot win itself', () => {
    // P2 to move, last tile Pr. P1 threatens Ps (index 8) to complete column 0.
    // P2 can take Ps (shares pine) or Pb (index 14, shares pine) or Mr/Cr... (rain).
    const s = stateFromPicture(
      `1  Mp Mb Mr
       1  Cp Cb Cr
       Ps 2  2  Ip
       1  Is Pb Ir`,
      2,
      parseTile('Pr'),
    );
    const r = chooseMove(s, { depth: 2 });
    expect(r.index).toBe(8);
  });

  it('sees a forced block win two plies ahead', () => {
    // P1 to move, last tile Mr. Taking Ms leaves Cp/Pb/Ip with nothing in common with Ms.
    const s = stateFromPicture(
      `Ms 2  1  2
       1  Cp 2  1
       2  1  Pb 2
       1  2  1  Ip`,
      1,
      parseTile('Mr'),
    );
    const r = chooseMove(s, { depth: 2 });
    expect(r.index).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(WIN - 20);
  });

  it('evaluation is antisymmetric', () => {
    let g = newGameFromTiles(parseLayout('Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir'));
    g = applyMove(g, 0);
    g = applyMove(g, 4);
    expect(evaluate(g, 1)).toBe(-evaluate(g, 2));
  });

  it('always returns a legal move and is deterministic for a given rng', () => {
    const g = newGame(7);
    const a = chooseMove(g, { depth: 3, rng: mulberry32(1) });
    const b = chooseMove(g, { depth: 3, rng: mulberry32(1) });
    expect(a.index).toBe(b.index);
    expect([0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]).toContain(a.index);
  });
});

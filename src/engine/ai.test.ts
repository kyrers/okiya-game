import { describe, expect, it } from 'vitest';
import { WIN, chooseMove, evaluate, tactics } from './ai';
import { applyMove, legalMoves, mulberry32, newGame, newGameFromTiles, parseLayout, parseTile } from './garden';
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

describe('tactical guard (careful rivals)', () => {
  /** Random positions reached by random legal play, stopping while the game is still live. */
  function randomPositions(count: number, seed: number) {
    const rng = mulberry32(seed);
    const out = [];
    let n = 0;
    while (out.length < count) {
      let g = newGame(seed + n++);
      const stopAt = 2 + Math.floor(rng() * 10);
      for (let i = 0; i < stopAt && !g.result; i++) {
        const legal = legalMoves(g);
        g = applyMove(g, legal[Math.floor(rng() * legal.length)]);
      }
      if (!g.result) out.push(g);
    }
    return out;
  }

  it('always takes an immediate win, even when told to blunder every move', () => {
    const s = stateFromPicture(
      `1  Mp Mb Mr
       1  Cp Cb Cr
       Ps 2  2  2
       1  Ip Pb Ir`,
      1,
      parseTile('Is'),
    );
    for (let k = 0; k < 20; k++) {
      expect(chooseMove(s, { depth: 1, blunder: 1, rng: mulberry32(k) }).index).toBe(8);
    }
  });

  it('never hands the opponent an immediate win when a safe move exists (1,000 random positions, depth 1, always blundering)', () => {
    let guarded = 0;
    for (const g of randomPositions(1000, 31)) {
      const t = tactics(g);
      const safeExists = t.losesNext.some((l) => !l);
      const r = chooseMove(g, { depth: 1, blunder: 1, rng: mulberry32(g.history.length) });
      const i = r.moves.indexOf(r.index);
      if (t.wins.some(Boolean)) expect(t.wins[i]).toBe(true);
      else if (safeExists) {
        expect(t.losesNext[i]).toBe(false);
        if (t.losesNext.some(Boolean)) guarded++;
      }
    }
    expect(guarded).toBeGreaterThan(50); // the guard actually had to steer away from losing moves
  });

  it('the search-based choice is also restricted to safe moves at every depth', () => {
    for (const depth of [1, 2, 3]) {
      for (const g of randomPositions(200, 100 + depth)) {
        const t = tactics(g);
        if (t.wins.some(Boolean) || !t.losesNext.some((l) => !l)) continue;
        const r = chooseMove(g, { depth, rng: mulberry32(depth) });
        expect(t.losesNext[r.moves.indexOf(r.index)]).toBe(false);
      }
    }
  });

  it('a careless AI may hand over an immediate win (that is what makes Easy easy)', () => {
    let handed = 0;
    for (const g of randomPositions(600, 77)) {
      const t = tactics(g);
      if (!t.losesNext.some(Boolean) || !t.losesNext.some((l) => !l)) continue;
      const r = chooseMove(g, { depth: 1, blunder: 1, careless: true, rng: mulberry32(g.history.length) });
      if (t.losesNext[r.moves.indexOf(r.index)]) handed++;
    }
    expect(handed).toBeGreaterThan(0);
  });

  it('tactics() agrees with the engine on a known position', () => {
    // P2 to move, last tile Pr. P1 threatens Ps (8) for column 0; P2 can take Ps itself (shares pine).
    const s = stateFromPicture(
      `1  Mp Mb Mr
       1  Cp Cb Cr
       Ps 2  2  Ip
       1  Is Pb Ir`,
      2,
      parseTile('Pr'),
    );
    const t = tactics(s);
    expect(t.moves).toEqual([3, 7, 8, 14, 15]); // rain: Mr Cr Ir; pine: Ps Pb
    expect(t.wins).toEqual([false, false, false, false, false]);
    // Only taking Ps (8) stops P1 from completing the column; the other moves let P1 play Ps
    // (sun is not shared by Mr/Cr/Ir... P1 may take Ps only if it shares pine or sun with the taken tile).
    expect(t.losesNext[t.moves.indexOf(8)]).toBe(false);
    expect(t.losesNext[t.moves.indexOf(14)]).toBe(true); // Pb shares pine with Ps -> P1 wins
    expect(chooseMove(s, { depth: 1, blunder: 1, rng: mulberry32(5) }).index).not.toBe(14);
  });
});

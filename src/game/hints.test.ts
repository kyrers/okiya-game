import { describe, expect, it } from 'vitest';
import { applyMove, newGameFromTiles, parseLayout, parseTile } from '../engine/okiya';
import { scoreGame } from '../engine/charms';
import { stateFromPicture } from '../engine/testUtils';
import { charmCellClasses, fireflyHints, worthNow } from './hints';

describe('Firefly hints (information only)', () => {
  it('marks immediate wins and tiles that hand the rival a win', () => {
    // P1 to move, last tile Pr. Ps (8) completes column 0 for P1.
    // Taking Pb (14) instead leaves P2 able to take Ps? No: after Pb the constraint is Pb (pine/bird);
    // Ps shares pine, and P2 taking Ps does not win for P2. So Pb is 'safe' unless P2 has a win.
    const s = stateFromPicture(
      `1  Mp Mb Mr
       1  Cp Cb Cr
       Ps 2  2  Ip
       1  Is Pb Ir`,
      1,
      parseTile('Pr'),
    );
    const h = fireflyHints(s, 1);
    expect(h.get(8)).toBe('win');
    expect([...h.keys()].sort((a, b) => a - b)).toEqual([3, 7, 8, 14, 15]); // pine or rain tiles
    expect(h.get(14)).toBe('safe');
  });

  it('is empty when it is not my turn', () => {
    const s = stateFromPicture(`Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir`, 2, null);
    expect(fireflyHints(s, 1).size).toBe(0);
  });

  it('marks a tile as danger when it hands the rival an immediate win', () => {
    // P1 to move, last tile Ms (maple or sun). P2 holds 1, 5, 9 and wins with Ip (13) if given poem or iris.
    // Taking Mp (1 is a token) is impossible; P1's options: Mb(2) Mr(3) -> maple; Cs(4) Ps(8) Is(12) -> sun.
    // Is (12) is iris: after it P2 may take Ip (iris) and complete column 1 -> danger.
    const s = stateFromPicture(
      `1  2  Mb Mr
       Cs 2  Cb Cr
       Ps 2  Pb Pr
       Is Ip Ib Ir`,
      1,
      parseTile('Ms'),
    );
    const h = fireflyHints(s, 1);
    expect(h.get(12)).toBe('danger');
    expect(h.get(2)).toBe('safe'); // Mb: P2 must play maple or bird; Ip is neither
  });

  it('never mutates the state it reads', () => {
    const s = stateFromPicture(`1 Mp Mb Mr Cs 1 Cb Cr Ps Pp Pb Pr Is Ip Ib Ir`, 1, parseTile('Cs'));
    const snapshot = JSON.stringify(s);
    fireflyHints(s, 1);
    worthNow(s, 1, ['corner-shrine', 'narrow-gate']);
    charmCellClasses(s, 1, ['rain-chain', 'narrow-gate'])(0);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('worth now (a win on my next move)', () => {
  it('rival to move: two more tiles leave the garden before I can win (14 -> 12)', () => {
    const s = stateFromPicture(
      `1  Mp Mb Mr
       Cs 1  Cb Cr
       Ps Pp Pb Pr
       Is Ip Ib Ir`,
      2,
      parseTile('Cp'),
    );
    const w = worthNow(s, 1, ['corner-shrine', 'heart-stone', 'stone-lantern']);
    expect(w.base).toBe(3);
    expect(w.tiles).toBe(12);
    expect(w.adds).toEqual([
      { id: 'corner-shrine', add: 2 },
      { id: 'heart-stone', add: 2 },
    ]);
    expect(w.total).toBe(3 + 12 + 4);
    expect(w.conditional).toEqual(['stone-lantern']);
    expect(w.exact).toBe(false);
  });

  it('my move, no immediate win: one more tile leaves the garden (14 -> 13)', () => {
    const s = stateFromPicture(`1 Mp Mb Mr Cs 1 Cb Cr Ps Pp Pb Pr Is Ip Ib Ir`, 1, parseTile('Cs'));
    expect(worthNow(s, 1, []).tiles).toBe(13);
    expect(worthNow(s, 1, []).total).toBe(16);
  });

  it('my move with a winning tile available: the exact payout of that win', () => {
    // Ps (index 8) completes column 0 for P1; 10 tiles are on the board, 9 remain afterwards.
    const s = stateFromPicture(
      `1  Mp Mb Mr
       1  Cp Cb Cr
       Ps 2  2  2
       1  Ip Pb Ir`,
      1,
      parseTile('Is'),
    );
    const w = worthNow(s, 1, ['bamboo-fence']);
    expect(w.exact).toBe(true);
    expect(w.tiles).toBe(9);
    expect(w.adds).toEqual([{ id: 'bamboo-fence', add: 4 }]);
    expect(w.total).toBe(3 + 9 + 4);
  });

  it('matches the real payout in the 13-move test game, one move before the end', () => {
    let g = newGameFromTiles(parseLayout('Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir'));
    for (const m of [0, 4, 5, 9, 1, 13, 14, 10, 2, 6, 7, 11]) g = applyMove(g, m);
    const w = worthNow(g, 1, []);
    const done = applyMove(g, 3);
    expect(w.total).toBe(scoreGame(done, 1, []).total);
    expect(w.total).toBe(6);
  });
});

describe('charm cell hints', () => {
  it('flags corners, centre cells and symbol-matching legal tiles', () => {
    const s = stateFromPicture(`1 Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir`, 1, parseTile('Cs'));
    const cls = charmCellClasses(s, 1, ['corner-shrine', 'heart-stone', 'rain-chain']);
    expect(cls(0)).toBe('hint-corner');
    expect(cls(5)).toBe('hint-centre');
    expect(cls(8)).toBe('hint-symbol'); // Ps shares sun with Cs
    expect(cls(7)).toBe(''); // Cr matches by vegetation, not symbol, and is neither corner nor centre
  });
});

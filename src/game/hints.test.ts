import { describe, expect, it } from 'vitest';
import { parseTile } from '../engine/okiya';
import { stateFromPicture } from '../engine/testUtils';
import { charmCellClasses, lanternHints, worthNow } from './hints';

describe('Paper Lantern hints (information only)', () => {
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
    const h = lanternHints(s, 1);
    expect(h.get(8)).toBe('win');
    expect([...h.keys()].sort((a, b) => a - b)).toEqual([3, 7, 8, 14, 15]); // pine or rain tiles
    expect(h.get(14)).toBe('safe');
  });

  it('is empty when it is not my turn', () => {
    const s = stateFromPicture(`Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir`, 2, null);
    expect(lanternHints(s, 1).size).toBe(0);
  });
});

describe('worth now', () => {
  it('counts base + tiles + position charms, lists win-type charms as conditional', () => {
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
    expect(w.tiles).toBe(14);
    expect(w.adds).toEqual([
      { id: 'corner-shrine', add: 2 },
      { id: 'heart-stone', add: 2 },
    ]);
    expect(w.total).toBe(3 + 14 + 4);
    expect(w.conditional).toEqual(['stone-lantern']);
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

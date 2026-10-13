import { describe, expect, it } from 'vitest';
import { BORDER_CELLS, FORMATIONS, applyMove, legalMoves, newGameFromTiles, parseLayout, tileCode } from '../engine/garden';
import { EXAMPLE_POSITION, EXAMPLE_TAKEN, WIN_DIAGRAMS } from './rules';

/** The rules page must never show a position the rules could not produce. */
describe('rules page diagrams', () => {
  it('the constraint example is reached by a legal game, and its lifted tiles are exactly the legal ones', () => {
    // The garden before the four moves: the tokens' cells held Ps, Pb, Mb and Mr.
    const original = EXAMPLE_POSITION.split(/\s+/);
    const taken: Record<number, string> = { 1: 'Ps', 4: 'Pb', 10: 'Mb', 15: 'Mr' };
    const layout = original.map((c, i) => taken[i] ?? c).join(' ');
    let g = newGameFromTiles(parseLayout(layout), 1);
    for (const m of [1, 4, 10, 15]) g = applyMove(g, m);
    expect(g.result).toBeNull();
    expect(g.lastTile && tileCode(g.lastTile)).toBe(EXAMPLE_TAKEN);
    const shown = g.board.map((c) => (c.kind === 'tile' ? tileCode(c.tile) : String(c.player)));
    expect(shown.join(' ')).toBe(EXAMPLE_POSITION.split(/\s+/).join(' '));
    // Five maple-or-rain tiles, as the text says.
    expect(legalMoves(g).map((i) => shown[i]).sort()).toEqual(['Cr', 'Ir', 'Mp', 'Ms', 'Pr']);
  });

  it('every win diagram is a plausible end of a game', () => {
    for (const [cells, formation] of WIN_DIAGRAMS) {
      const c = cells.split(/\s+/);
      const ones = c.filter((x) => x === '1').length;
      const twos = c.filter((x) => x === '2').length;
      // Turns alternate, so the counts differ by at most one; someone opened on the outer ring.
      expect(Math.abs(ones - twos)).toBeLessThanOrEqual(1);
      expect(BORDER_CELLS.some((i) => c[i] === '1' || c[i] === '2')).toBe(true);
      const holds = (p: string) => FORMATIONS.filter((f) => f.cells.every((i) => c[i] === p));
      if (formation) {
        // The winner made the last move, so has at least as many tokens; the loser has no formation.
        expect(ones).toBeGreaterThanOrEqual(twos);
        expect(holds('1').map((f) => [...f.cells].sort((a, b) => a - b))).toContainEqual([...formation].sort((a, b) => a - b));
        expect(holds('2')).toEqual([]);
      } else {
        // The block: tiles remain, and nobody has a formation.
        expect(c.filter((x) => x === 'x').length).toBeGreaterThan(0);
        expect(holds('1')).toEqual([]);
        expect(holds('2')).toEqual([]);
      }
    }
  });
});

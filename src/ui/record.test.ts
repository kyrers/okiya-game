import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, mulberry32, newGame, type GameState, type Player } from '../engine/garden';
import { recordHtml, recordRows } from './record';
import { reasonWords } from './words';

/** Random legal games from seeded gardens until one ends the way `want` says. */
function playUntil(want: (g: GameState) => boolean): GameState {
  for (let n = 0; n < 20000; n++) {
    const rng = mulberry32(n + 1);
    let g = newGame(n * 7 + 3, (n % 2 === 0 ? 1 : 2) as Player);
    while (!g.result) {
      const legal = legalMoves(g);
      g = applyMove(g, legal[Math.floor(rng() * legal.length)]);
    }
    if (want(g)) return g;
  }
  throw new Error('no such game found');
}

const NAMES: [string, string] = ['Aki', 'Ren'];

describe('the play by play', () => {
  it('has one row per move, in order, by the player who made it, and only the last says how the game ended', () => {
    const g = playUntil((s) => s.result!.reason === 'row');
    const rows = recordRows(g, NAMES);
    expect(rows.map((r) => r.n)).toEqual(g.history.map((_, i) => i + 1));
    expect(rows.map((r) => r.move)).toEqual(g.history);
    // Turns alternate from whoever opened.
    const opener = g.history[0].player;
    rows.forEach((r, i) => expect(r.move.player).toBe(i % 2 === 0 ? opener : 3 - opener));
    expect(rows.slice(0, -1).every((r) => r.note === null)).toBe(true);
    expect(rows.at(-1)!.note).toBe('Four in a row');
  });

  it('names the player left with no tile to take, and says when the garden filled', () => {
    const blocked = playUntil((s) => s.result!.reason === 'blocked');
    const loser = NAMES[(blocked.result!.winner === 1 ? 2 : 1) - 1];
    expect(recordRows(blocked, NAMES).at(-1)!.note).toBe(reasonWords('blocked', loser));
    const tie = playUntil((s) => s.result!.winner === null);
    expect(recordRows(tie, NAMES).at(-1)!.note).toBe('The garden is full');
  });

  it('escapes names in the sheet', () => {
    const g = playUntil((s) => s.result!.reason === 'blocked');
    const html = recordHtml(g, ['<b>A</b>', 'R&D']);
    expect(html).not.toContain('<b>A</b>');
    expect(html).toContain('&lt;b&gt;A&lt;/b&gt;');
    expect(html).toContain('R&amp;D');
    expect(html.match(/class="record-move/g)!.length).toBe(g.history.length);
  });
});

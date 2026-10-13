import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, mulberry32, parseLayout, type Player } from '../engine/garden';
import { derive, nextGame, play, restore, seededRng, startMatch, undo, type MatchSetup, type MatchView } from './match';

const CANON = parseLayout('Ms Mp Mb Mr  Cs Cp Cb Cr  Ps Pp Pb Pr  Is Ip Ib Ir');
const hotSeat: MatchSetup = { opponent: 'human', difficulty: 'medium', mode: 'sets3', names: ['Aki', 'Ren'] };
const vsComputer: MatchSetup = { opponent: 'computer', difficulty: 'hard', mode: 'single', names: ['x', 'y'] };

/** Play random legal moves until the current game ends. */
function finishGame(view: MatchView, rng: () => number): MatchView {
  let v = view;
  while (!v.game.result) {
    const legal = legalMoves(v.game);
    v = play(v, legal[Math.floor(rng() * legal.length)]);
  }
  return v;
}

/** A game on the canonical layout that P(first) wins with the top row on move 13. */
function canonWinFor(first: Player) {
  return { tiles: CANON, first, moves: [0, 4, 5, 9, 1, 13, 14, 10, 2, 6, 7, 11, 3] };
}

describe('starting a match', () => {
  it('chooses the first player at random and lays out all 16 tiles', () => {
    const openers = new Set<number>();
    for (let s = 0; s < 20; s++) {
      const v = startMatch(hotSeat, seededRng(s));
      openers.add(v.game.current);
      expect(v.game.history).toEqual([]);
      expect(v.saved.games[0].tiles).toHaveLength(16);
      expect(new Set(v.saved.games[0].tiles.map((t) => t.veg + t.sym)).size).toBe(16);
      expect(v.gameNumber).toBe(1);
    }
    expect([...openers].sort()).toEqual([1, 2]);
  });

  it('names: computer games are always You vs Computer; hot-seat names are trimmed, capped and defaulted', () => {
    expect(startMatch(vsComputer, seededRng(1)).saved.setup.names).toEqual(['You', 'Computer']);
    const v = startMatch({ ...hotSeat, names: ['  Mariko   Tanaka-Watanabe the Third ', '   '] }, seededRng(1));
    expect(v.saved.setup.names).toEqual(['Mariko Tanaka-Wa', 'Player 2']);
  });
});

describe('playing', () => {
  it('records moves, finishes the game and scores the match', () => {
    let v = derive({ version: 1, setup: hotSeat, games: [{ tiles: CANON, first: 1, moves: [] }] });
    for (const m of canonWinFor(1).moves) v = play(v, m);
    expect(v.game.result?.winner).toBe(1);
    expect(v.match.wins).toEqual({ 1: 1, 2: 0 });
    expect(v.match.nextFirst).toBe(2);
    expect(() => play(v, 8)).toThrow();
  });

  it('the loser opens the next game, and the match ends at three won games', () => {
    let v = startMatch(hotSeat, seededRng(4));
    const rng = mulberry32(9);
    let games = 0;
    while (true) {
      v = finishGame(v, rng);
      games++;
      if (v.match.over) break;
      const r = v.game.result!;
      v = nextGame(v, rng);
      const expected = r.winner === null ? (v.saved.games[v.saved.games.length - 2].first === 1 ? 2 : 1) : r.winner === 1 ? 2 : 1;
      expect(v.game.current).toBe(expected);
    }
    expect(Math.max(v.match.wins[1], v.match.wins[2])).toBe(3);
    expect(v.match.champion).not.toBeNull();
    expect(v.gameNumber).toBe(games);
    expect(() => nextGame(v)).toThrow(/match is over/);
  });

  it('cannot start the next game before the current one is over', () => {
    expect(() => nextGame(startMatch(hotSeat, seededRng(2)))).toThrow(/not over/);
  });
});

describe('undo', () => {
  it('hot-seat: takes back exactly one move', () => {
    let v = derive({ version: 1, setup: hotSeat, games: [{ tiles: CANON, first: 1, moves: [] }] });
    expect(undo(v, null)).toBeNull();
    v = play(play(v, 0), 4);
    const u = undo(v, null)!;
    expect(u.saved.games[0].moves).toEqual([0]);
    expect(u.game.current).toBe(2);
  });

  it('against the computer: goes back to the last position where the person was to move', () => {
    // Person (1) opens: person 0, computer 4, person 5, computer 9 -> back to after computer 4.
    let v = derive({ version: 1, setup: vsComputer, games: [{ tiles: CANON, first: 1, moves: [0, 4, 5, 9] }] });
    v = undo(v, 1)!;
    expect(v.saved.games[0].moves).toEqual([0, 4]);
    expect(v.game.current).toBe(1);
    v = undo(v, 1)!;
    expect(v.saved.games[0].moves).toEqual([]);
    expect(undo(v, 1)).toBeNull();
    // Computer (2) opened: its opening move cannot be taken back.
    const c = derive({ version: 1, setup: vsComputer, games: [{ tiles: CANON, first: 2, moves: [0] }] });
    expect(undo(c, 1)).toBeNull();
  });

  it('is not available once the game is over', () => {
    const v = derive({ version: 1, setup: hotSeat, games: [canonWinFor(1)] });
    expect(v.game.result).not.toBeNull();
    expect(undo(v, null)).toBeNull();
  });
});

describe('restoring a saved match', () => {
  it('round-trips through JSON', () => {
    let v = startMatch(hotSeat, seededRng(11));
    v = finishGame(v, mulberry32(3));
    v = nextGame(v, mulberry32(4));
    v = play(v, legalMoves(v.game)[0]);
    const r = restore(JSON.parse(JSON.stringify(v.saved)))!;
    expect(r).not.toBeNull();
    expect(r.match).toEqual(v.match);
    expect(r.game).toEqual(v.game);
    expect(r.gameNumber).toBe(2);
  });

  it('rejects anything that is not a legal match', () => {
    const good = { version: 1, setup: hotSeat, games: [canonWinFor(1), { tiles: CANON, first: 2, moves: [] }] };
    expect(restore(good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      42,
      'x',
      [],
      { ...good, version: 2 },
      { ...good, setup: { ...hotSeat, mode: 'points12' } },
      { ...good, setup: { ...hotSeat, difficulty: 'master' } },
      { ...good, setup: { ...hotSeat, opponent: 'robot' } },
      { ...good, games: [] },
      // the winner opens the next game
      { ...good, games: [canonWinFor(1), { tiles: CANON, first: 1, moves: [] }] },
      // an unfinished game followed by another
      { ...good, games: [{ tiles: CANON, first: 1, moves: [0] }, { tiles: CANON, first: 2, moves: [] }] },
      // illegal first move (centre tile)
      { ...good, games: [{ tiles: CANON, first: 1, moves: [5] }] },
      // a tile outside the official set
      { ...good, games: [{ tiles: [{ veg: 'bamboo', sym: 'sun' }, ...CANON.slice(1)], first: 1, moves: [] }] },
      // duplicate tiles
      { ...good, games: [{ tiles: [CANON[1], ...CANON.slice(1)], first: 1, moves: [] }] },
      // moves that are not board indices
      { ...good, games: [{ tiles: CANON, first: 1, moves: [0.5] }] },
      { ...good, games: [{ tiles: CANON, first: 3, moves: [] }] },
      // a single-game match that continues after its only game
      { ...good, setup: { ...hotSeat, mode: 'single' } },
    ];
    for (const b of bad) expect(restore(b)).toBeNull();
  });

  it('a restored match can be played on', () => {
    const r = restore({ version: 1, setup: hotSeat, games: [{ tiles: CANON, first: 1, moves: [0] }] })!;
    const next = play(r, 4);
    expect(next.game.board[4]).toEqual({ kind: 'token', player: 2 });
    expect(applyMove(next.game, 5).board[5]).toEqual({ kind: 'token', player: 1 });
  });
});

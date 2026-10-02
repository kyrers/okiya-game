import { describe, expect, it } from 'vitest';
import {
  BORDER_CELLS,
  CENTRE_CELLS,
  FORMATIONS,
  FULL_GARDEN_RULE,
  mulberry32,
  allTiles,
  applyMove,
  boardToString,
  findWin,
  isLegalMove,
  isSymbol,
  isTile,
  isVegetation,
  legalMoves,
  newGame,
  newGameFromTiles,
  newMatch,
  parseLayout,
  parseTile,
  recordGame,
  sharesElement,
  tileCode,
  tilesRemaining,
  tokensInHand,
  type GameState,
  type Tile,
  type WinInfo,
} from './okiya';
import { stateFromPicture } from './testUtils';

/** Canonical layout: rows are vegetations (M, C, P, I); columns are symbols (s, p, b, r). */
const CANON = 'Ms Mp Mb Mr  Cs Cp Cb Cr  Ps Pp Pb Pr  Is Ip Ib Ir';

describe('tile set', () => {
  it('has exactly 16 distinct tiles: 4 vegetations x 4 symbols', () => {
    const tiles = allTiles();
    expect(tiles).toHaveLength(16);
    expect(new Set(tiles.map(tileCode)).size).toBe(16);
    expect(tiles.map(tileCode).join(' ')).toBe('Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir');
  });

  it('has 4 tiles of each vegetation and 4 of each symbol', () => {
    const tiles = allTiles();
    expect(tiles.filter((t) => t.veg === 'maple')).toHaveLength(4);
    expect(tiles.filter((t) => t.veg === 'cherry')).toHaveLength(4);
    expect(tiles.filter((t) => t.veg === 'pine')).toHaveLength(4);
    expect(tiles.filter((t) => t.veg === 'iris')).toHaveLength(4);
    expect(tiles.filter((t) => t.sym === 'sun')).toHaveLength(4);
    expect(tiles.filter((t) => t.sym === 'poem')).toHaveLength(4);
    expect(tiles.filter((t) => t.sym === 'bird')).toHaveLength(4);
    expect(tiles.filter((t) => t.sym === 'rain')).toHaveLength(4);
  });

  it('sharesElement: same vegetation OR same symbol', () => {
    const Cb = parseTile('Cb');
    expect(sharesElement(Cb, parseTile('Cs'))).toBe(true); // same vegetation (cherry)
    expect(sharesElement(Cb, parseTile('Pb'))).toBe(true); // same symbol (bird)
    expect(sharesElement(Cb, parseTile('Cb'))).toBe(true); // identical
    expect(sharesElement(Cb, parseTile('Mr'))).toBe(false); // nothing in common
    expect(sharesElement(Cb, parseTile('Is'))).toBe(false);
  });

  it('tile codes round-trip', () => {
    expect(tileCode(parseTile('Ir'))).toBe('Ir');
    expect(parseTile('Pp')).toEqual({ veg: 'pine', sym: 'poem' });
    expect(() => parseTile('Xy')).toThrow();
  });
});

describe('setup', () => {
  it('a seeded game is a permutation of all 16 tiles, reproducible from the seed', () => {
    const a = newGame(42);
    const b = newGame(42);
    expect(boardToString(a.board)).toBe(boardToString(b.board));
    const codes = a.board.map((c) => (c.kind === 'tile' ? tileCode(c.tile) : '??')).sort();
    expect(codes).toEqual('Ms Mp Mb Mr Cs Cp Cb Cr Ps Pp Pb Pr Is Ip Ib Ir'.split(' ').sort());
    expect(a.current).toBe(1);
    expect(a.lastTile).toBeNull();
    expect(a.history).toEqual([]);
    expect(a.win).toBeNull();
    expect(tilesRemaining(a.board)).toBe(16);
  });

  it('seed 42 always produces this exact garden (regression)', () => {
    expect(boardToString(newGame(42).board)).toBe(['Is Cr Ms Ir', 'Cs Mp Mr Ib', 'Pb Ip Cp Mb', 'Ps Pr Cb Pp'].join('\n'));
  });

  it('different seeds produce different gardens', () => {
    expect(boardToString(newGame(1).board)).not.toBe(boardToString(newGame(2).board));
  });

  it('rejects layouts that are not 16 distinct tiles', () => {
    expect(() => newGameFromTiles(parseLayout('Ms Mp'))).toThrow(/expected 16/);
    const dup = parseLayout(CANON);
    dup[15] = dup[0];
    expect(() => newGameFromTiles(dup)).toThrow(/duplicate/);
  });

  it('rejects tiles outside the official set (vegetation, symbol, shape), as a restored save might carry', () => {
    const bamboo = parseLayout(CANON);
    bamboo[3] = { veg: 'bamboo', sym: 'sun' } as unknown as Tile; // unofficial vegetation, still 16 "distinct" tiles
    expect(() => newGameFromTiles(bamboo)).toThrow(/invalid tile at index 3/);
    const moon = parseLayout(CANON);
    moon[0] = { veg: 'maple', sym: 'moon' } as unknown as Tile; // unofficial symbol
    expect(() => newGameFromTiles(moon)).toThrow(/invalid tile at index 0/);
    const extra = parseLayout(CANON);
    extra[5] = { veg: 'cherry', sym: 'poem', bonus: 99 } as unknown as Tile; // extra field
    expect(() => newGameFromTiles(extra)).toThrow(/invalid tile at index 5/);
    const hole = parseLayout(CANON);
    (hole as unknown[])[9] = null; // missing cell
    expect(() => newGameFromTiles(hole)).toThrow(/invalid tile at index 9/);
    const str = parseLayout(CANON);
    (str as unknown[])[12] = 'Is'; // a code string instead of a tile object
    expect(() => newGameFromTiles(str)).toThrow(/invalid tile at index 12/);
    const sparse = parseLayout(CANON);
    delete (sparse as unknown[])[9]; // a hole, as a save with a token but no history entry produces
    expect(() => newGameFromTiles(sparse)).toThrow(/invalid tile at index 9/);
    expect(() => newGameFromTiles(new Array(16) as Tile[])).toThrow(/invalid tile at index 0/);
    expect(() => newGameFromTiles('not an array' as unknown as Tile[])).toThrow(/expected an array/);
    expect(() => newGameFromTiles(parseLayout(CANON), 3 as unknown as 1)).toThrow(/invalid first player/);
  });

  it('isTile / isVegetation / isSymbol accept exactly the official values', () => {
    for (const t of allTiles()) expect(isTile(t)).toBe(true);
    expect(isTile({ veg: 'bamboo', sym: 'sun' })).toBe(false);
    expect(isTile({ veg: 'maple', sym: 'Sun' })).toBe(false); // case matters
    expect(isTile({ veg: 'maple' })).toBe(false);
    expect(isTile({ veg: 'maple', sym: 'sun', extra: 1 })).toBe(false);
    expect(isTile(['maple', 'sun'])).toBe(false);
    expect(isTile(null)).toBe(false);
    expect(isVegetation('iris')).toBe(true);
    expect(isVegetation('Iris')).toBe(false);
    expect(isSymbol('rain')).toBe(true);
    expect(isSymbol('cloud')).toBe(false);
  });

  it('each player starts with 8 tokens in hand', () => {
    const g = newGame(1);
    expect(tokensInHand(g, 1)).toBe(8);
    expect(tokensInHand(g, 2)).toBe(8);
  });
});

describe('first move', () => {
  it('may only take one of the 12 border tiles, never the 4 centre tiles', () => {
    const g = newGameFromTiles(parseLayout(CANON));
    expect(legalMoves(g)).toEqual([0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    expect(legalMoves(g)).toEqual([...BORDER_CELLS]);
    expect(CENTRE_CELLS).toEqual([5, 6, 9, 10]);
    for (const c of CENTRE_CELLS) expect(isLegalMove(g, c)).toBe(false);
  });

  it('taking a centre tile first throws', () => {
    const g = newGameFromTiles(parseLayout(CANON));
    expect(() => applyMove(g, 5)).toThrow(/illegal move 5/);
    expect(() => applyMove(g, 10)).toThrow(/illegal move 10/);
  });

  it('places the first player token, records the removed tile and passes the turn', () => {
    const g = applyMove(newGameFromTiles(parseLayout(CANON)), 0);
    expect(g.board[0]).toEqual({ kind: 'token', player: 1 });
    expect(g.lastTile).toEqual({ veg: 'maple', sym: 'sun' });
    expect(g.current).toBe(2);
    expect(g.history).toEqual([{ player: 1, index: 0, tile: { veg: 'maple', sym: 'sun' } }]);
    expect(tokensInHand(g, 1)).toBe(7);
    expect(tokensInHand(g, 2)).toBe(8);
    expect(tilesRemaining(g.board)).toBe(15);
    expect(g.win).toBeNull();
  });

  it('a second player who starts the game is also restricted to the border', () => {
    const g = newGameFromTiles(parseLayout(CANON), 2);
    expect(g.current).toBe(2);
    expect(legalMoves(g)).toEqual([0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    expect(applyMove(g, 3).board[3]).toEqual({ kind: 'token', player: 2 });
  });
});

describe('constraint: next tile must share vegetation or symbol with the last removed tile', () => {
  it('after Ms (maple/sun) is removed, only maple tiles and sun tiles are legal', () => {
    const g = applyMove(newGameFromTiles(parseLayout(CANON)), 0); // removes Ms at index 0
    // maple row: Mp(1) Mb(2) Mr(3); sun column: Cs(4) Ps(8) Is(12). Index 0 is now a token.
    expect(legalMoves(g)).toEqual([1, 2, 3, 4, 8, 12]);
  });

  it('a tile with nothing in common is illegal, and so is a cell holding a token', () => {
    const g = applyMove(newGameFromTiles(parseLayout(CANON)), 0);
    expect(() => applyMove(g, 5)).toThrow(/illegal move 5/); // Cp shares nothing with Ms
    expect(() => applyMove(g, 0)).toThrow(/illegal move 0/); // already a token
  });

  it('centre tiles become legal from the second move on', () => {
    const g = applyMove(newGameFromTiles(parseLayout(CANON)), 1); // removes Mp
    // maple: Ms(0) Mb(2) Mr(3); poem: Cp(5) Pp(9) Ip(13)
    expect(legalMoves(g)).toEqual([0, 2, 3, 5, 9, 13]);
    expect(isLegalMove(g, 5)).toBe(true);
  });

  it('the constraint always refers to the most recently removed tile', () => {
    let g = newGameFromTiles(parseLayout(CANON));
    g = applyMove(g, 0); // P1 takes Ms
    g = applyMove(g, 4); // P2 takes Cs (shares sun)
    expect(g.lastTile).toEqual({ veg: 'cherry', sym: 'sun' });
    // cherry row: Cp(5) Cb(6) Cr(7); sun column: Ps(8) Is(12). Ms and Cs are gone.
    expect(legalMoves(g)).toEqual([5, 6, 7, 8, 12]);
  });
});

describe('winning formations', () => {
  it('there are 4 rows, 4 columns, 2 diagonals and 9 squares', () => {
    expect(FORMATIONS.filter((f) => f.reason === 'row')).toHaveLength(4);
    expect(FORMATIONS.filter((f) => f.reason === 'column')).toHaveLength(4);
    expect(FORMATIONS.filter((f) => f.reason === 'diagonal')).toHaveLength(2);
    expect(FORMATIONS.filter((f) => f.reason === 'square')).toHaveLength(9);
    expect(FORMATIONS.map((f) => f.cells)).toContainEqual([0, 5, 10, 15]);
    expect(FORMATIONS.map((f) => f.cells)).toContainEqual([3, 6, 9, 12]);
    expect(FORMATIONS.map((f) => f.cells)).toContainEqual([5, 6, 9, 10]);
  });

  it('detects a horizontal row', () => {
    const s = stateFromPicture(
      `Ms Mp Mb Mr
       Cs Cp Cb Cr
       1  1  1  1
       2  2  2  Ir`,
      2,
      parseTile('Ib'),
    );
    expect(findWin(s.board, 1)).toEqual({ reason: 'row', cells: [8, 9, 10, 11] });
    expect(findWin(s.board, 2)).toBeNull();
  });

  it('detects a vertical column', () => {
    const s = stateFromPicture(
      `Ms 2  Mb Mr
       Cs 2  Cb Cr
       1  2  1  1
       Is 2  Ib Ir`,
      1,
      parseTile('Ip'),
    );
    expect(findWin(s.board, 2)).toEqual({ reason: 'column', cells: [1, 5, 9, 13] });
    expect(findWin(s.board, 1)).toBeNull();
  });

  it('detects both diagonals', () => {
    const main = stateFromPicture(
      `1  Mp Mb Mr
       Cs 1  Cb Cr
       Ps Pp 1  Pr
       Is Ip Ib 1`,
      2,
      parseTile('Ir'),
    );
    expect(findWin(main.board, 1)).toEqual({ reason: 'diagonal', cells: [0, 5, 10, 15] });
    const anti = stateFromPicture(
      `Ms Mp Mb 2
       Cs Cp 2  Cr
       Ps 2  Pb Pr
       2  Ip Ib Ir`,
      1,
      parseTile('Is'),
    );
    expect(findWin(anti.board, 2)).toEqual({ reason: 'diagonal', cells: [3, 6, 9, 12] });
  });

  it('detects a 2x2 square anywhere, including the centre', () => {
    const centre = stateFromPicture(
      `Ms Mp Mb Mr
       Cs 1  1  Cr
       Ps 1  1  Pr
       Is Ip Ib Ir`,
      2,
      parseTile('Pb'),
    );
    expect(findWin(centre.board, 1)).toEqual({ reason: 'square', cells: [5, 6, 9, 10] });
    const corner = stateFromPicture(
      `Ms Mp Mb Mr
       Cs Cp Cb Cr
       Ps Pp 2  2
       Is Ip 2  2`,
      1,
      parseTile('Ir'),
    );
    expect(findWin(corner.board, 2)).toEqual({ reason: 'square', cells: [10, 11, 14, 15] });
  });

  it('three in a row, an L-shape or a mixed square is NOT a win', () => {
    const s = stateFromPicture(
      `1  1  1  2
       1  2  Cb Cr
       2  1  Pb Pr
       Is Ip Ib Ir`,
      2,
      parseTile('Cp'),
    );
    expect(findWin(s.board, 1)).toBeNull();
    expect(findWin(s.board, 2)).toBeNull();
  });
});

describe('a full legal game ending in a row', () => {
  it('player 1 completes the top row on move 13 with 3 tiles left in the garden', () => {
    let g = newGameFromTiles(parseLayout(CANON));
    const moves = [0, 4, 5, 9, 1, 13, 14, 10, 2, 6, 7, 11, 3];
    //   P1 Ms, P2 Cs(sun), P1 Cp(cherry), P2 Pp(poem), P1 Mp(poem), P2 Ip(poem),
    //   P1 Ib(iris), P2 Pb(bird), P1 Mb(bird), P2 Cb(bird), P1 Cr(cherry), P2 Pr(rain), P1 Mr(rain)
    for (let i = 0; i < moves.length - 1; i++) {
      g = applyMove(g, moves[i]);
      expect(g.win).toBeNull();
    }
    g = applyMove(g, moves[moves.length - 1]);
    expect(boardToString(g.board)).toBe(['1. 1. 1. 1.', '2. 1. 2. 1.', 'Ps 2. 2. 2.', 'Is 2. 1. Ir'].join('\n'));
    expect(g.win).toEqual<WinInfo>({ winner: 1, reason: 'row', cells: [0, 1, 2, 3], tilesRemaining: 3 });
    expect(g.history).toHaveLength(13);
    expect(tokensInHand(g, 1)).toBe(1);
    expect(tokensInHand(g, 2)).toBe(2);
    expect(legalMoves(g)).toEqual([]);
    expect(() => applyMove(g, 8)).toThrow(/game is over/);
  });
});

describe('blocking the opponent', () => {
  it('the player who leaves the opponent without a legal move wins', () => {
    // P1 to move; last removed tile is Mr. Only Ms shares an element (maple) with it.
    // After P1 takes Ms, the remaining tiles Cp, Pb, Ip share nothing with Ms: P2 is blocked.
    const s = stateFromPicture(
      `Ms 2  1  2
       1  Cp 2  1
       2  1  Pb 2
       1  2  1  Ip`,
      1,
      parseTile('Mr'),
    );
    expect(legalMoves(s)).toEqual([0]);
    const after = applyMove(s, 0);
    expect(after.win).toEqual<WinInfo>({ winner: 1, reason: 'blocked', cells: [], tilesRemaining: 3 });
    expect(legalMoves(after)).toEqual([]);
  });

  it('a state with no legal move for the player to move is reported as empty', () => {
    const s = stateFromPicture(
      `1  2  1  2
       1  Cp 2  1
       2  1  Pb 2
       1  2  1  Ir`,
      2,
      parseTile('Ms'),
    );
    expect(legalMoves(s)).toEqual([]);
  });

  it('filling the last tile without a formation also blocks the opponent (no draws)', () => {
    const s = stateFromPicture(
      `1 1 2 2
       2 2 1 1
       1 1 2 2
       2 2 1 Ir`,
      1,
      parseTile('Is'),
    );
    const after = applyMove(s, 15);
    expect(after.win).toEqual<WinInfo>({ winner: 1, reason: 'blocked', cells: [], tilesRemaining: 0, fullGarden: true });
    // This ending is an interpretation (the PDF is silent); the engine flags it explicitly.
    expect(FULL_GARDEN_RULE).toBe('blocked');
  });

  it('a normal block (tiles still in the garden) is not flagged as a full garden', () => {
    const s = stateFromPicture(
      `Ms 2  1  2
       1  Cp 2  1
       2  1  Pb 2
       1  2  1  Ip`,
      1,
      parseTile('Mr'),
    );
    expect(applyMove(s, 0).win?.fullGarden).toBeUndefined();
  });

  it('a formation takes precedence over a block when both happen on the same move', () => {
    const s = stateFromPicture(
      `1  1  1  Mr
       2  2  2  Cp
       Ps 2  Pb 2
       Is Ip Ib 1`,
      1,
      parseTile('Ir'),
    );
    // P1 takes Mr (shares rain) completing row 0; irrelevant that P2 might be blocked.
    // 7 tiles before the move (Mr Cp Ps Pb Is Ip Ib), 6 after.
    const after = applyMove(s, 3);
    expect(after.win).toEqual<WinInfo>({ winner: 1, reason: 'row', cells: [0, 1, 2, 3], tilesRemaining: 6 });
  });
});

describe('match variants (End of the game)', () => {
  const p1wins = (tilesRemaining: number): WinInfo => ({ winner: 1, reason: 'row', cells: [0, 1, 2, 3], tilesRemaining });
  const p2wins = (tilesRemaining: number): WinInfo => ({ winner: 2, reason: 'blocked', cells: [], tilesRemaining });

  it('single game: the winner of the round wins the match', () => {
    const m = recordGame(newMatch('single', 1), p2wins(5));
    expect(m.champion).toBe(2);
    expect(m.wins).toEqual({ 1: 0, 2: 1 });
    expect(m.gamesPlayed).toBe(1);
  });

  it('match in three sets: first to 3 won games', () => {
    let m = newMatch('sets3', 1);
    m = recordGame(m, p1wins(4));
    m = recordGame(m, p2wins(2));
    m = recordGame(m, p1wins(6));
    expect(m.champion).toBeNull();
    m = recordGame(m, p1wins(1));
    expect(m.wins).toEqual({ 1: 3, 2: 1 });
    expect(m.champion).toBe(1);
    expect(() => recordGame(m, p1wins(1))).toThrow(/match is over/);
  });

  it('victory points: winner scores the tiles left in the garden; first to 10 wins', () => {
    let m = newMatch('points10', 1);
    m = recordGame(m, p1wins(4));
    expect(m.points).toEqual({ 1: 4, 2: 0 });
    m = recordGame(m, p2wins(7));
    expect(m.points).toEqual({ 1: 4, 2: 7 });
    m = recordGame(m, p1wins(5));
    expect(m.points).toEqual({ 1: 9, 2: 7 });
    expect(m.champion).toBeNull();
    m = recordGame(m, p1wins(1));
    expect(m.points).toEqual({ 1: 10, 2: 7 });
    expect(m.champion).toBe(1);
  });

  it('victory points to 15 and 20 for longer matches', () => {
    let m = newMatch('points15', 2);
    for (let i = 0; i < 3; i++) m = recordGame(m, p1wins(4)); // 12
    expect(m.champion).toBeNull();
    m = recordGame(m, p1wins(3)); // 15
    expect(m.champion).toBe(1);
    let n = newMatch('points20', 1);
    for (let i = 0; i < 4; i++) n = recordGame(n, p2wins(4)); // 16
    expect(n.champion).toBeNull();
    n = recordGame(n, p2wins(4)); // 20
    expect(n.champion).toBe(2);
  });

  it('the loser of the previous game starts the next one', () => {
    let m = newMatch('sets3', 1);
    expect(m.nextFirst).toBe(1);
    m = recordGame(m, p1wins(3));
    expect(m.nextFirst).toBe(2);
    m = recordGame(m, p2wins(3));
    expect(m.nextFirst).toBe(1);
  });
});

describe('wins reached through applyMove for every formation type', () => {
  it('column: P2 completes column 1 (indices 1, 5, 9, 13)', () => {
    // P1 to move on CANON with P2 holding 1, 5, 9 and Ip (13) still in the garden.
    const s = stateFromPicture(
      `1  2  Mb Mr
       1  2  Cb Cr
       1  2  Pb Pr
       Is Ip Ib Ir`,
      2,
      parseTile('Pp'), // last removed tile Pp: P2 may play pine or poem -> Pb(10), Pr(11), Ip(13)
    );
    expect(legalMoves(s)).toEqual([10, 11, 13]);
    const after = applyMove(s, 13);
    // 10 tiles on the board before the move, 9 after.
    expect(after.win).toEqual<WinInfo>({ winner: 2, reason: 'column', cells: [1, 5, 9, 13], tilesRemaining: 9 });
  });

  it('diagonal: P1 completes the anti-diagonal (3, 6, 9, 12) and the engine reports "diagonal"', () => {
    const s = stateFromPicture(
      `Ms Mp Mb 1
       Cs Cp 1  2
       Ps 1  Pb 2
       Is Ip Ib Ir`,
      1,
      parseTile('Ir'), // P2 just took Ir: iris or rain -> Is(12), Ip(13), Ib(14)
    );
    const after = applyMove(s, 12);
    // 11 tiles on the board before the move, 10 after.
    expect(after.win).toEqual<WinInfo>({ winner: 1, reason: 'diagonal', cells: [3, 6, 9, 12], tilesRemaining: 10 });
  });

  it('a move completing two formations reports the first in the fixed order rows, columns, diagonals, squares', () => {
    // P1 completes row 0 AND column 0 with index 0.
    const s = stateFromPicture(
      `Ms 1  1  1
       1  Cp Cb 2
       1  Pp 2  Pr
       1  2  Ib 2`,
      1,
      parseTile('Mp'),
    );
    const after = applyMove(s, 0);
    expect(after.win?.reason).toBe('row');
    expect(after.win?.cells).toEqual([0, 1, 2, 3]);
  });
});

describe('newGame with the second player opening', () => {
  it('respects the first argument and the border rule for that player', () => {
    const g = newGame(5, 2);
    expect(g.current).toBe(2);
    expect(legalMoves(g)).toEqual([0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    const after = applyMove(g, 0);
    expect(after.board[0]).toEqual({ kind: 'token', player: 2 });
    expect(after.current).toBe(1);
  });
});

describe('property check: random games against an independent reference', () => {
  /** Independent re-statement of the legal-move rule, written without looking at legalMoves(). */
  function referenceLegal(state: GameState): number[] {
    if (state.win) return [];
    const out: number[] = [];
    for (let i = 0; i < 16; i++) {
      const c = state.board[i];
      if (c.kind !== 'tile') continue;
      const row = Math.floor(i / 4);
      const col = i % 4;
      if (state.lastTile === null) {
        const border = row === 0 || row === 3 || col === 0 || col === 3;
        if (border) out.push(i);
      } else if (c.tile.veg === state.lastTile.veg || c.tile.sym === state.lastTile.sym) out.push(i);
    }
    return out;
  }

  it('500 random games: legal sets match, illegal indices throw, exactly one winner, at most 8 tokens each, no draws', () => {
    const rng = mulberry32(2026);
    let fullGardens = 0;
    for (let n = 0; n < 500; n++) {
      let g = newGame(n, (n % 2) + 1 as 1 | 2);
      let moves = 0;
      while (!g.win) {
        const legal = legalMoves(g);
        expect(legal).toEqual(referenceLegal(g));
        expect(legal.length).toBeGreaterThan(0);
        for (let i = 0; i < 16; i++) if (!legal.includes(i)) expect(() => applyMove(g, i)).toThrow();
        const pick = legal[Math.floor(rng() * legal.length)];
        const next = applyMove(g, pick);
        expect(next.history.length).toBe(g.history.length + 1);
        expect(next.lastTile).toEqual((g.board[pick] as { tile: Tile }).tile);
        g = next;
        moves++;
        expect(moves).toBeLessThanOrEqual(16);
      }
      expect(tokensInHand(g, 1)).toBeGreaterThanOrEqual(0);
      expect(tokensInHand(g, 2)).toBeGreaterThanOrEqual(0);
      expect(g.win!.tilesRemaining).toBe(tilesRemaining(g.board));
      expect(legalMoves(g)).toEqual([]);
      if (g.win!.reason === 'blocked') expect(referenceLegal({ ...g, win: null })).toEqual([]);
      else expect(findWin(g.board, g.win!.winner)).not.toBeNull();
      // The loser never has a formation of their own on the board.
      expect(findWin(g.board, g.win!.winner === 1 ? 2 : 1)).toBeNull();
      if (g.win!.fullGarden) fullGardens++;
    }
    expect(fullGardens).toBeGreaterThan(0);
  }, 30000);
});

describe('immutability', () => {
  it('applyMove never mutates the previous state', () => {
    const g0 = newGameFromTiles(parseLayout(CANON));
    const snapshot = JSON.stringify(g0);
    const g1 = applyMove(g0, 0);
    expect(JSON.stringify(g0)).toBe(snapshot);
    expect(g1).not.toBe(g0);
    expect(g1.board).not.toBe(g0.board);
    const t: Tile = { veg: 'maple', sym: 'sun' };
    expect(g0.board[0]).toEqual({ kind: 'tile', tile: t });
  });
});

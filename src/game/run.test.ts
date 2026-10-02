import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, mulberry32 } from '../engine/okiya';
import { chooseMove } from '../engine/ai';
import { CHARMS } from '../engine/charms';
import { continueRun, draftOffers, finishGame, firstOpener, lanternsLeft, newRun, pickCharm, requiredOpener, skipDraft, startGame, useFirefly, validateRun, type RunState } from './run';
import { MAX_HELD, STATIONS } from './stations';

/**
 * Drive a run as the app would: the human plays with a strong search, the rival with the
 * station's own settings, through finishGame/continueRun, until the run leaves the current
 * station (draft, won or lost) or `games` games have been tallied. Deterministic per seed.
 */
function driveStation(run: RunState, humanDepth: number, games = 3): RunState {
  const rng = mulberry32(run.seed ^ 0x51ed);
  const startStation = run.station;
  let played = 0;
  while (played < games) {
    if (run.phase === 'intro') run = startGame(run);
    if (run.phase !== 'playing') break;
    const st = STATIONS[run.station];
    let g = run.game!;
    while (!g.win) {
      const opts = g.current === 1 ? { depth: humanDepth, rng } : { ...st.ai, rng };
      g = applyMove(g, chooseMove(g, opts).index);
    }
    run = finishGame({ ...run, game: g });
    played++;
    const next = continueRun(run);
    if (next.station !== startStation || next.phase === 'won' || next.phase === 'lost') return next;
    run = next;
  }
  return run;
}

/** A legitimate run that has cleared station 1 and is drafting at station 2 (searched over seeds). */
function clearedTwoStations(): RunState {
  for (let seed = 1; seed < 400; seed++) {
    let run = newRun(seed);
    run = pickCharm(run, run.offers[0]);
    run = driveStation(run, 4);
    if (run.phase !== 'draft' || run.station !== 1) continue;
    run = pickCharm(run, run.offers[0]);
    run = driveStation(run, 4);
    if (run.phase === 'draft' && run.station === 2) return run;
  }
  throw new Error('no seed cleared two stations');
}

/** Play the current game to the end with depth-1 AIs on both sides (deterministic). */
function playOut(run: RunState): RunState {
  let g = run.game!;
  let i = 0;
  while (!g.win) {
    const r = chooseMove(g, { depth: 1, rng: () => (i++ % 7) / 7 });
    g = applyMove(g, r.index);
  }
  return { ...run, game: g };
}

describe('stations', () => {
  it('six stations with rising rival strength and three lanterns each', () => {
    expect(STATIONS).toHaveLength(6);
    expect(STATIONS.map((s) => s.ai.depth)).toEqual([1, 1, 2, 3, 5, 8]);
    expect(STATIONS.every((s) => s.lanterns === 3)).toBe(true);
    for (let i = 1; i < STATIONS.length; i++) {
      expect(STATIONS[i].ai.depth).toBeGreaterThanOrEqual(STATIONS[i - 1].ai.depth);
      if (i >= 2) expect(STATIONS[i].ai.blunder ?? 0).toBeLessThanOrEqual(STATIONS[i - 1].ai.blunder ?? 0);
    }
  });

  it('only the first rival is careless: from station 2 on, rivals never miss an immediate block or win', () => {
    expect(STATIONS[0].ai.careless).toBe(true);
    for (const s of STATIONS.slice(1)) expect(s.ai.careless ?? false).toBe(false);
  });
});

describe('run flow', () => {
  it('starts with a draft of 3 distinct charms and an empty hand', () => {
    const run = newRun(42);
    expect(run.phase).toBe('start-draft');
    expect(run.offers).toHaveLength(3);
    expect(new Set(run.offers).size).toBe(3);
    expect(run.held).toEqual([]);
    expect(run.station).toBe(0);
  });

  it('draft offers are reproducible from the seed and never include held charms', () => {
    expect(draftOffers(7, 1, [])).toEqual(draftOffers(7, 1, []));
    const held = CHARMS.slice(0, 4).map((c) => c.id);
    for (const id of draftOffers(7, 2, held)) expect(held).not.toContain(id);
  });

  it('picking a charm moves to the station intro; a game then starts with the engine', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    expect(run.phase).toBe('intro');
    expect(run.held).toHaveLength(1);
    run = startGame(run);
    expect(run.phase).toBe('playing');
    expect(run.game).not.toBeNull();
    expect(run.game!.history).toEqual([]);
    expect(legalMoves(run.game!)).toEqual([0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]); // border-only first move
    expect(lanternsLeft(run)).toBe(3);
  });

  it('refuses to record an unfinished game', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    expect(() => finishGame(run)).toThrow(/no finished game/);
  });

  it('records a finished game, scores petals, and makes the loser start the next game', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = playOut(run);
    const winner = run.game!.win!.winner;
    run = finishGame(run);
    expect(run.phase).toBe('result');
    expect(run.gamesPlayed).toBe(1);
    expect(run.log).toHaveLength(1);
    expect(run.log[0].won).toBe(winner === 1);
    expect(run.lastResult!.total).toBe(run.stationPetals);
    expect(run.nextFirst).toBe(winner === 1 ? 2 : 1);
    if (winner === 1) expect(run.stationPetals).toBeGreaterThanOrEqual(3);
    else expect(run.stationPetals).toBe(0);
  });

  it('a station with the target unmet after 3 lanterns ends the run', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    // Force a huge target so it can never be met.
    const big = { ...run, station: 0 };
    let r = startGame(big);
    for (let g = 0; g < 3; g++) {
      r = playOut(r);
      // Make sure the human never scores by pretending every win is the rival's: easier to
      // just set stationPetals back to 0 before each finish (petals are still logged).
      r = finishGame({ ...r, stationPetals: 0 });
      r = { ...r, stationPetals: 0 };
      if (g < 2) {
        r = continueRun(r);
        expect(r.phase).toBe('playing');
      }
    }
    expect(r.gamesPlayed).toBe(3);
    expect(continueRun(r).phase).toBe('lost');
  });

  it('clearing the target leads to a draft at the next station; after the last station the run is won', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = playOut(run);
    run = finishGame({ ...run, stationPetals: 1000 }); // pretend we already have enough petals
    run = continueRun(run);
    expect(run.phase).toBe('draft');
    expect(run.station).toBe(1);
    expect(run.gamesPlayed).toBe(0);
    expect(run.stationPetals).toBe(0);
    expect(run.offers).toHaveLength(3);
    run = skipDraft(run);
    expect(run.phase).toBe('intro');
    // Jump to the last station and clear it.
    run = { ...run, station: 5 };
    run = startGame(run);
    run = playOut(run);
    run = finishGame({ ...run, stationPetals: 1000 });
    expect(continueRun(run).phase).toBe('won');
  });

  it('the hand holds at most 4 charms; a 5th pick must release one', () => {
    let run = newRun(42);
    run = { ...run, held: CHARMS.slice(0, MAX_HELD).map((c) => c.id), phase: 'draft', offers: draftOffers(42, 3, CHARMS.slice(0, MAX_HELD).map((c) => c.id)) };
    expect(() => pickCharm(run, run.offers[0])).toThrow(/hand is full/);
    const picked = pickCharm(run, run.offers[0], run.held[1]);
    expect(picked.held).toHaveLength(4);
    expect(picked.held).toContain(run.offers[0]);
    expect(picked.held).not.toContain(run.held[1]);
  });

  it('the Firefly can be used once per station and resets at the next station', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = useFirefly(run);
    expect(run.fireflyUsed).toBe(true);
    expect(() => useFirefly(run)).toThrow(/already used/);
    run = startGame(run);
    run = playOut(run);
    run = finishGame({ ...run, stationPetals: 1000 });
    run = continueRun(run);
    expect(run.fireflyUsed).toBe(false);
  });

  it('validateRun accepts a genuine save and rejects tampered or malformed ones', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = { ...run, game: applyMove(run.game!, 0) };
    const saved = JSON.parse(JSON.stringify(run));
    expect(validateRun(saved)).toEqual(run);
    // A token moved by hand: the replay no longer matches.
    const tampered = JSON.parse(JSON.stringify(run)) as RunState;
    (tampered.game as unknown as { board: unknown[] }).board[5] = { kind: 'token', player: 1 };
    expect(validateRun(tampered)).toBeNull();
    expect(validateRun(null)).toBeNull();
    expect(validateRun({ seed: 1 })).toBeNull();
    expect(validateRun({ ...saved, held: ['not-a-charm'] })).toBeNull();
    expect(validateRun({ ...saved, phase: 'playing', game: null })).toBeNull();
  });

  it('validateRun rejects saves whose tiles are outside the official set, even when internally consistent', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = { ...run, game: applyMove(run.game!, 0) };
    const save = JSON.parse(JSON.stringify(run)) as RunState;
    // A consistently edited save: a board tile AND its vegetation replaced by "bamboo".
    const bambooBoard = JSON.parse(JSON.stringify(save)) as RunState;
    const cell = (bambooBoard.game as unknown as { board: { kind: string; tile?: { veg: string; sym: string } }[] }).board.find((c) => c.kind === 'tile')!;
    cell.tile!.veg = 'bamboo';
    expect(validateRun(bambooBoard)).toBeNull();
    // The taken tile in the history edited to an unofficial symbol.
    const moonHistory = JSON.parse(JSON.stringify(save)) as RunState;
    const h = (moonHistory.game as unknown as { history: { tile: { veg: string; sym: string } }[]; lastTile: { veg: string; sym: string } });
    h.history[0].tile.sym = 'moon';
    h.lastTile.sym = 'moon';
    expect(validateRun(moonHistory)).toBeNull();
    // An unofficial last tile alone.
    const badLast = JSON.parse(JSON.stringify(save)) as RunState;
    (badLast.game as unknown as { lastTile: { veg: string } }).lastTile.veg = 'bamboo';
    expect(validateRun(badLast)).toBeNull();
    // A tile object with an extra field.
    const extra = JSON.parse(JSON.stringify(save)) as RunState;
    const c2 = (extra.game as unknown as { board: { kind: string; tile?: Record<string, unknown> }[] }).board.find((c) => c.kind === 'tile')!;
    c2.tile!.bonus = 1;
    expect(validateRun(extra)).toBeNull();
    // Control: the untouched save is accepted.
    expect(validateRun(save)).toEqual(run);
  });

  it('validateRun rejects malformed non-tile fields', () => {
    let run = newRun(7);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    const save = JSON.parse(JSON.stringify(run)) as RunState;
    const mutate = (f: (s: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
      f(copy);
      return validateRun(copy);
    };
    expect(mutate((s) => { s.stationPetals = Number.NaN; })).toBeNull();
    expect(mutate((s) => { s.stationPetals = -5; })).toBeNull();
    expect(mutate((s) => { s.stationPetals = '12'; })).toBeNull();
    expect(mutate((s) => { s.totalPetals = 0; s.stationPetals = 3; })).toBeNull(); // station > total
    expect(mutate((s) => { s.gamesPlayed = 4; })).toBeNull(); // more games than lanterns
    expect(mutate((s) => { s.fireflyUsed = 'yes'; })).toBeNull();
    expect(mutate((s) => { s.offers = [(s.held as string[])[0]]; })).toBeNull(); // offer overlaps the hand
    expect(mutate((s) => { s.held = ['corner-shrine', 'corner-shrine']; })).toBeNull(); // duplicate charm
    expect(mutate((s) => { s.log = [{ station: 0, game: 0, won: 'yes', petals: 1, reason: 'row', moves: 9 }]; })).toBeNull();
    expect(mutate((s) => { (s.game as Record<string, unknown>).current = 3; })).toBeNull();
    expect(mutate((s) => { (s.game as Record<string, unknown>).win = { winner: 1, reason: 'row', cells: [0, 1, 2, 3], tilesRemaining: 12 }; })).toBeNull(); // forged win
    expect(mutate((s) => { ((s.game as Record<string, unknown>).board as unknown[])[0] = { kind: 'token', player: 1 }; })).toBeNull(); // token without a move
    expect(mutate((s) => { s.phase = 'result'; s.lastResult = null; })).toBeNull(); // result phase needs a finished game
    expect(mutate(() => {})).toEqual(run);
  });

  it('validateRun accepts legitimate saves at every phase of a multi-station run, after JSON round-trips', () => {
    // Saves are JSON: a tally's charm copies lose their `score` function, so compare round-trips.
    const rt = (r: RunState) => JSON.parse(JSON.stringify(r)) as unknown;
    const accepts = (r: RunState) => expect(validateRun(rt(r))).toEqual(rt(r));
    let run = clearedTwoStations(); // draft at station 2 with a log across two cleared stations
    expect(run.log.length).toBeGreaterThanOrEqual(2);
    accepts(run);
    run = skipDraft(run);
    accepts(run); // intro, carrying the previous tally
    run = startGame(run);
    accepts(run); // playing, no moves
    run = { ...run, game: applyMove(run.game!, legalMoves(run.game!)[0]) };
    run = useFirefly(run);
    accepts(run); // playing with a move and the firefly used
    run = playOut(run);
    accepts(run); // finished game not yet tallied (resume tallies it)
    run = finishGame(run);
    accepts(run); // result
    const after = continueRun(run);
    accepts(after); // next game or station
    // A run that was lost (3 games without the target).
    let lost = newRun(5);
    lost = pickCharm(lost, lost.offers[0]);
    lost = startGame(lost);
    for (let i = 0; i < 3; i++) {
      lost = playOut({ ...lost, game: lost.game ?? startGame(lost).game });
      lost = finishGame(lost);
      lost = continueRun(lost);
      if (lost.phase !== 'playing') break;
    }
    accepts(lost);
  });

  it('validateRun rejects saves whose counters, offers, phase or tally the state machine could not have produced', () => {
    let run = newRun(9);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = playOut(run);
    const finished = run; // 'playing' with a finished game
    const result = finishGame(run); // 'result'
    const rt = (r: unknown) => JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    const mut = (base: RunState, f: (s: Record<string, unknown>) => void) => {
      const copy = rt(base);
      f(copy);
      return validateRun(copy);
    };
    expect(validateRun(rt(result))).toEqual(rt(result)); // control
    // The tally must equal what the charm layer recomputes from the finished game.
    expect(mut(result, (s) => { s.lastResult = {}; })).toBeNull();
    expect(mut(result, (s) => { s.lastResult = []; })).toBeNull();
    expect(mut(result, (s) => { (s.lastResult as Record<string, unknown>).total = 999; })).toBeNull();
    expect(mut(result, (s) => { (s.lastResult as Record<string, unknown>).total = '<b>x</b>'; })).toBeNull();
    expect(mut(result, (s) => { ((s.lastResult as Record<string, unknown>).effects as unknown[]).push({}); })).toBeNull();
    // The log must explain the counters.
    expect(mut(result, (s) => { s.log = []; })).toBeNull();
    expect(mut(result, (s) => { (s.log as Record<string, unknown>[])[0].petals = ((s.log as Record<string, unknown>[])[0].petals as number) + 1; })).toBeNull();
    expect(mut(result, (s) => { s.stationPetals = (s.stationPetals as number) + 1; s.totalPetals = (s.totalPetals as number) + 1; })).toBeNull();
    expect(mut(result, (s) => { s.station = 5; (s.log as Record<string, unknown>[])[0].station = 5; })).toBeNull(); // earlier stations never cleared
    // Games played are bounded by the phase.
    expect(mut(result, (s) => { s.gamesPlayed = 0; })).toBeNull();
    expect(mut(finished, (s) => { s.gamesPlayed = 3; })).toBeNull();
    const intro = pickCharm(newRun(9), newRun(9).offers[0]);
    expect(mut(intro, (s) => { s.gamesPlayed = 3; })).toBeNull();
    expect(mut(intro, (s) => { s.game = rt(finished.game); })).toBeNull(); // no game outside playing/result
    // Offers are exactly the deterministic draft for the phase.
    const start = newRun(9);
    expect(mut(start, (s) => { s.offers = []; })).toBeNull();
    expect(mut(start, (s) => { (s.offers as string[]).reverse(); })).toBeNull();
    expect(mut(intro, (s) => { s.offers = start.offers; })).toBeNull();
    // Opener consistency and huge numbers.
    expect(mut(finished, (s) => { s.nextFirst = s.nextFirst === 1 ? 2 : 1; })).toBeNull();
    expect(mut(result, (s) => { s.nextFirst = s.nextFirst === 1 ? 2 : 1; })).toBeNull();
    expect(mut(result, (s) => { s.totalPetals = 1e300; s.stationPetals = 1e300; })).toBeNull();
    expect(mut(result, (s) => { s.seed = 2 ** 40; })).toBeNull();
    expect(mut(result, (s) => { (s.log as Record<string, unknown>[])[0].reason = 'xyz'; })).toBeNull();
    // Unknown keys are dropped rather than persisted.
    const extra = rt(result);
    extra.mystery = 1;
    expect(validateRun(extra)).toEqual(rt(result));
  });

  it('validateRun derives the opener from the previous result: a save that lets the previous WINNER open is rejected', () => {
    // Reproduction from the review: seed 9, finish the first game with the first legal move each
    // turn, continue to the next game, then set both nextFirst and the new game's opener to the
    // previous winner.
    let run = newRun(9);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    let g = run.game!;
    while (!g.win) g = applyMove(g, legalMoves(g)[0]);
    run = finishGame({ ...run, game: g });
    const winner = g.win!.winner;
    const loser = winner === 1 ? 2 : 1;
    run = continueRun(run);
    expect(run.phase).toBe('playing');
    expect(run.nextFirst).toBe(loser);
    expect(run.game!.current).toBe(loser);
    const rt = (r: unknown) => JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    expect(validateRun(rt(run))).toEqual(rt(run)); // control: the genuine save is accepted
    const forged = rt(run);
    forged.nextFirst = winner;
    (forged.game as Record<string, unknown>).current = winner;
    expect(validateRun(forged)).toBeNull();
    // The same forgery after the opener has already moved (history present) is rejected too.
    const moved = { ...run, game: applyMove({ ...run.game!, current: winner }, legalMoves(run.game!)[0]) };
    const forgedMoved = rt({ ...moved, nextFirst: winner });
    expect(validateRun(forgedMoved)).toBeNull();
    // Forging only nextFirst, or only the opener, is rejected as well.
    const onlyNext = rt(run);
    onlyNext.nextFirst = winner;
    expect(validateRun(onlyNext)).toBeNull();
    const onlyOpener = rt(run);
    (onlyOpener.game as Record<string, unknown>).current = winner;
    expect(validateRun(onlyOpener)).toBeNull();
  });

  it('validateRun pins the garden to the seed and game index, and ties log results to petals and the carried tally', () => {
    let run = newRun(9);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    let g = run.game!;
    while (!g.win) g = applyMove(g, legalMoves(g)[0]);
    run = finishGame({ ...run, game: g });
    const winner = g.win!.winner;
    run = continueRun(run); // playing, game 1 of station 0
    const rt = (r: unknown) => JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    expect(validateRun(rt(run))).toEqual(rt(run));
    // (a) Two untouched tiles swapped on the board: not the garden the seed deals -> rejected.
    const swapped = rt(run);
    const board = (swapped.game as Record<string, unknown>).board as unknown[];
    [board[0], board[1]] = [board[1], board[0]];
    expect(validateRun(swapped)).toBeNull();
    // (b) A fabricated earlier game prepended to the log so that the "loser" of a game that never
    // happened opens the real first game: the layout no longer matches the claimed game index.
    const fresh = pickCharm(newRun(9), newRun(9).offers[0]);
    const firstGame = startGame(fresh);
    const toss = firstGame.game!.current;
    const fake = rt({
      ...firstGame,
      game: { ...firstGame.game!, current: toss === 1 ? 2 : 1 },
      gamesPlayed: 1,
      log: [{ station: 0, game: 0, won: toss === 2, petals: toss === 2 ? 5 : 0, reason: 'row', moves: 9 }],
      stationPetals: toss === 2 ? 5 : 0,
      totalPetals: toss === 2 ? 5 : 0,
      nextFirst: toss === 1 ? 2 : 1,
    });
    expect(validateRun(fake)).toBeNull();
    // (c) The previous result flipped with petals kept and the opener re-derived: won/petals contradict.
    const flipped = rt(run);
    const entry = (flipped.log as Record<string, unknown>[])[0];
    entry.won = !entry.won;
    flipped.nextFirst = winner;
    (flipped.game as Record<string, unknown>).current = winner;
    expect(validateRun(flipped)).toBeNull();
    // (d) A tally carried into 'playing', or one that disagrees with the last logged game.
    const carried = rt(run);
    carried.lastResult = rt(finishGame({ ...startGame(pickCharm(newRun(9), newRun(9).offers[0])), game: g }).lastResult);
    expect(validateRun(carried)).toBeNull();
    const result = finishGame({ ...startGame(pickCharm(newRun(9), newRun(9).offers[0])), game: g });
    const intro = continueRun({ ...result, stationPetals: 0 }); // not cleared: next game -> 'playing'
    expect(intro.phase).toBe('playing');
    const afterStation = (() => {
      // Reach a draft legitimately so lastResult is carried: reuse the helper above.
      const r2 = clearedTwoStations();
      return r2;
    })();
    expect(afterStation.lastResult).not.toBeNull();
    expect(validateRun(rt(afterStation))).toEqual(rt(afterStation));
    const badTally = rt(afterStation);
    (badTally.lastResult as Record<string, unknown>).total = ((badTally.lastResult as Record<string, unknown>).total as number) + 1;
    expect(validateRun(badTally)).toBeNull();
  });

  it('the first game of a run must be opened by the seeded coin toss, and requiredOpener follows the log', () => {
    const run = pickCharm(newRun(9), newRun(9).offers[0]);
    const started = startGame(run);
    expect(started.game!.current).toBe(firstOpener(9));
    expect(requiredOpener(9, [])).toBe(firstOpener(9));
    expect(requiredOpener(9, [{ station: 0, game: 0, won: true, petals: 5, reason: 'row', moves: 9 }])).toBe(2);
    expect(requiredOpener(9, [{ station: 0, game: 0, won: false, petals: 0, reason: 'blocked', moves: 16 }])).toBe(1);
    const rt = (r: unknown) => JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    const other = firstOpener(9) === 1 ? 2 : 1;
    const forged = rt(started);
    forged.nextFirst = other;
    (forged.game as Record<string, unknown>).current = other;
    expect(validateRun(forged)).toBeNull();
    expect(validateRun(rt(started))).toEqual(rt(started));
  });

  it('the next game really starts with the recorded loser', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    run = playOut(run);
    const loser = run.game!.win!.winner === 1 ? 2 : 1;
    run = finishGame(run);
    run = continueRun(run);
    expect(run.phase).toBe('playing');
    expect(run.game!.current).toBe(loser);
  });

  it('the whole run is serialisable JSON (for autosave)', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    const copy = JSON.parse(JSON.stringify(run)) as RunState;
    expect(copy).toEqual(run);
  });
});

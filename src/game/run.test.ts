import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../engine/okiya';
import { chooseMove } from '../engine/ai';
import { CHARMS } from '../engine/charms';
import { continueRun, draftOffers, finishGame, lanternsLeft, newRun, pickCharm, skipDraft, startGame, useLantern, type RunState } from './run';
import { MAX_HELD, STATIONS } from './stations';

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
  it('six stations with rising rival depth and three lanterns each', () => {
    expect(STATIONS).toHaveLength(6);
    expect(STATIONS.map((s) => s.ai.depth)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(STATIONS.map((s) => s.target)).toEqual([30, 33, 16, 12, 12, 8]);
    expect(STATIONS.every((s) => s.lanterns === 3)).toBe(true);
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

  it('the Paper Lantern can be used once per station and resets at the next station', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = useLantern(run);
    expect(run.lanternUsed).toBe(true);
    expect(() => useLantern(run)).toThrow(/already used/);
    run = startGame(run);
    run = playOut(run);
    run = finishGame({ ...run, stationPetals: 1000 });
    run = continueRun(run);
    expect(run.lanternUsed).toBe(false);
  });

  it('the whole run is serialisable JSON (for autosave)', () => {
    let run = newRun(42);
    run = pickCharm(run, run.offers[0]);
    run = startGame(run);
    const copy = JSON.parse(JSON.stringify(run)) as RunState;
    expect(copy).toEqual(run);
  });
});

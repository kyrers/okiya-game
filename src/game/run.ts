/**
 * Hanamichi run state machine. Pure functions over a serialisable RunState;
 * the UI drives it and persists it. All Okiya play goes through the engine;
 * this module only sequences games and scores finished ones with charms.
 */
import { CHARMS, scoreGame, type CharmId, type PetalBreakdown } from '../engine/charms';
import { mulberry32, newGame, opponent, type GameState, type Player } from '../engine/okiya';
import { DRAFT_SIZE, MAX_HELD, STATIONS } from './stations';

export type Phase = 'start-draft' | 'intro' | 'playing' | 'result' | 'draft' | 'won' | 'lost';

export interface GameRecord {
  station: number;
  game: number;
  won: boolean;
  petals: number;
  reason: string;
  moves: number;
}

export interface RunState {
  seed: number;
  phase: Phase;
  station: number;
  /** Games finished at the current station. */
  gamesPlayed: number;
  /** Petals gathered at the current station. */
  stationPetals: number;
  held: CharmId[];
  offers: CharmId[];
  lanternUsed: boolean;
  /** The human is always player 1; this is who starts the next game. */
  nextFirst: Player;
  game: GameState | null;
  lastResult: PetalBreakdown | null;
  totalPetals: number;
  log: GameRecord[];
}

export const HUMAN: Player = 1;

function rng(seed: number, salt: number): () => number {
  return mulberry32((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
}

export function draftOffers(seed: number, salt: number, held: readonly CharmId[]): CharmId[] {
  const r = rng(seed, salt);
  const pool = CHARMS.map((c) => c.id).filter((id) => !held.includes(id));
  const out: CharmId[] = [];
  while (out.length < DRAFT_SIZE && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

export function newRun(seed: number): RunState {
  return {
    seed,
    phase: 'start-draft',
    station: 0,
    gamesPlayed: 0,
    stationPetals: 0,
    held: [],
    offers: draftOffers(seed, 0, []),
    lanternUsed: false,
    nextFirst: rng(seed, 99)() < 0.5 ? 1 : 2,
    game: null,
    lastResult: null,
    totalPetals: 0,
    log: [],
  };
}

export function currentStation(run: RunState) {
  return STATIONS[run.station];
}

/** Pick a charm from the offers. `release` names a held charm to drop when the hand is full. */
export function pickCharm(run: RunState, id: CharmId, release?: CharmId): RunState {
  if (run.phase !== 'start-draft' && run.phase !== 'draft') throw new Error('not drafting');
  if (!run.offers.includes(id)) throw new Error('charm not offered');
  let held = run.held.slice();
  if (held.length >= MAX_HELD) {
    if (!release || !held.includes(release)) throw new Error('hand is full: choose a charm to release');
    held = held.filter((h) => h !== release);
  }
  held.push(id);
  return { ...run, held, offers: [], phase: 'intro' };
}

/** Skip the draft (keep the current hand). */
export function skipDraft(run: RunState): RunState {
  if (run.phase !== 'draft') throw new Error('not drafting');
  return { ...run, offers: [], phase: 'intro' };
}

/** Light the next lantern: start a new Okiya game at the current station. */
export function startGame(run: RunState): RunState {
  if (run.phase !== 'intro' && run.phase !== 'result') throw new Error(`cannot start a game in phase ${run.phase}`);
  const st = currentStation(run);
  if (run.gamesPlayed >= st.lanterns) throw new Error('no lanterns left');
  const gameSeed = (run.seed + run.station * 1000 + run.gamesPlayed * 7 + 1) >>> 0;
  const game = newGame(gameSeed, run.nextFirst);
  return { ...run, phase: 'playing', game, lastResult: null };
}

/** Record the game currently in `run.game` once the engine says it is over. */
export function finishGame(run: RunState): RunState {
  if (run.phase !== 'playing' || !run.game || !run.game.win) throw new Error('no finished game to record');
  const st = currentStation(run);
  const result = scoreGame(run.game, HUMAN, run.held);
  const petals = result.total;
  const record: GameRecord = {
    station: run.station,
    game: run.gamesPlayed,
    won: result.won,
    petals,
    reason: run.game.win.reason,
    moves: run.game.history.length,
  };
  const stationPetals = run.stationPetals + petals;
  const gamesPlayed = run.gamesPlayed + 1;
  const cleared = stationPetals >= st.target;
  const out: RunState = {
    ...run,
    phase: 'result',
    gamesPlayed,
    stationPetals,
    totalPetals: run.totalPetals + petals,
    lastResult: result,
    log: [...run.log, record],
    // Official rule: the loser of the previous game starts the next one.
    nextFirst: opponent(run.game.win.winner),
  };
  if (cleared) return out; // continue() will advance
  if (gamesPlayed >= st.lanterns) return { ...out, phase: 'result' };
  return out;
}

/** Leave the result screen: draft, next game, or the end of the run. */
export function continueRun(run: RunState): RunState {
  if (run.phase !== 'result') throw new Error('not on a result');
  const st = currentStation(run);
  if (run.stationPetals >= st.target) {
    if (run.station >= STATIONS.length - 1) return { ...run, phase: 'won', game: null };
    const next = run.station + 1;
    return {
      ...run,
      phase: 'draft',
      station: next,
      gamesPlayed: 0,
      stationPetals: 0,
      lanternUsed: false,
      offers: draftOffers(run.seed, next, run.held),
      game: null,
    };
  }
  if (run.gamesPlayed >= st.lanterns) return { ...run, phase: 'lost', game: null };
  return startGame(run);
}

export function stationCleared(run: RunState): boolean {
  return run.stationPetals >= currentStation(run).target;
}

export function lanternsLeft(run: RunState): number {
  return currentStation(run).lanterns - run.gamesPlayed;
}

export function useLantern(run: RunState): RunState {
  if (run.lanternUsed) throw new Error('lantern already used at this station');
  return { ...run, lanternUsed: true };
}

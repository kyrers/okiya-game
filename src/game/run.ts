/**
 * Hanamichi run state machine. Pure functions over a serialisable RunState;
 * the UI drives it and persists it. All Okiya play goes through the engine;
 * this module only sequences games and scores finished ones with charms.
 */
import { BASE_PETALS, CHARMS, scoreGame, type CharmId, type PetalBreakdown } from '../engine/charms';
import { applyMove, isPlayer, isTile, isWinReason, mulberry32, newGame, opponent, type GameState, type Player } from '../engine/okiya';
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
  fireflyUsed: boolean;
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

/** The seeded coin toss that decides who opens the first game of a run (PDF: "chosen randomly"). */
export function firstOpener(seed: number): Player {
  return rng(seed, 99)() < 0.5 ? 1 : 2;
}

/**
 * Who must open the next game of a run: the coin toss before the first game, afterwards the
 * loser of the most recent game (official rule), which the log records as `won` for the human.
 */
export function requiredOpener(seed: number, log: readonly GameRecord[]): Player {
  if (log.length === 0) return firstOpener(seed);
  return log[log.length - 1].won ? opponent(HUMAN) : HUMAN;
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
    fireflyUsed: false,
    nextFirst: firstOpener(seed),
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

/** The seed of the garden dealt for a given station and game index: the only layout a run can show there. */
export function gameSeed(runSeed: number, station: number, gameIndex: number): number {
  return (runSeed + station * 1000 + gameIndex * 7 + 1) >>> 0;
}

/** Light the next lantern: start a new Okiya game at the current station. */
export function startGame(run: RunState): RunState {
  if (run.phase !== 'intro' && run.phase !== 'result') throw new Error(`cannot start a game in phase ${run.phase}`);
  const st = currentStation(run);
  if (run.gamesPlayed >= st.lanterns) throw new Error('no lanterns left');
  const game = newGame(gameSeed(run.seed, run.station, run.gamesPlayed), run.nextFirst);
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
      fireflyUsed: false,
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

export function useFirefly(run: RunState): RunState {
  if (run.fireflyUsed) throw new Error('firefly already used at this station');
  return { ...run, fireflyUsed: true };
}

/** Largest count accepted from a save (petals, seeds, indices); the app never gets near it. */
const MAX_COUNT = 1_000_000_000;

/**
 * Validate a run loaded from storage. Returns the run when every field is one the state
 * machine in this module can produce, otherwise null, so a corrupted or hand-edited save is
 * discarded instead of being played. In order:
 *  1. field types and ranges (official tile set, charm catalogue, station table);
 *  2. per-phase invariants: which phases carry a game, how many games/offers, who moves first;
 *  3. the game is rebuilt by replaying its history through the engine and must match exactly;
 *  4. the log must explain the petal counters (sums per station and in total, games played,
 *     earlier stations cleared) and, in the result phase, the saved tally must equal the one
 *     the charm layer recomputes from the finished game.
 */
export function validateRun(raw: unknown): RunState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= MAX_COUNT && !Object.is(x, -0);
  const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
  const phases: readonly Phase[] = ['start-draft', 'intro', 'playing', 'result', 'draft', 'won', 'lost'];
  const ids = new Set<string>(CHARMS.map((c) => c.id));
  const isCharmList = (x: unknown, max: number): x is CharmId[] =>
    Array.isArray(x) && x.length <= max && x.every((id) => typeof id === 'string' && ids.has(id)) && new Set(x).size === x.length;

  /* ---- 1. fields ---- */
  if (typeof r.seed !== 'number' || !Number.isSafeInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff) return null;
  if (typeof r.phase !== 'string' || !phases.includes(r.phase as Phase)) return null;
  const phase = r.phase as Phase;
  if (!isCount(r.station) || r.station >= STATIONS.length) return null;
  const station = STATIONS[r.station];
  if (!isCount(r.gamesPlayed) || !isCount(r.stationPetals) || !isCount(r.totalPetals)) return null;
  if (!isCharmList(r.held, MAX_HELD) || !isCharmList(r.offers, DRAFT_SIZE)) return null;
  const held = r.held as CharmId[];
  if (typeof r.fireflyUsed !== 'boolean' || !isPlayer(r.nextFirst)) return null;
  if (!Array.isArray(r.log)) return null;
  for (const entry of r.log as unknown[]) {
    if (!isRecord(entry)) return null;
    if (!isCount(entry.station) || entry.station >= STATIONS.length) return null;
    if (!isCount(entry.game) || entry.game >= STATIONS[entry.station].lanterns) return null;
    if (typeof entry.won !== 'boolean' || !isCount(entry.petals) || !isWinReason(entry.reason)) return null;
    if (!isCount(entry.moves) || entry.moves < 1 || entry.moves > 16) return null;
    // A lost game scores exactly 0; a won game at least the base petals.
    if (entry.won ? entry.petals < BASE_PETALS : entry.petals !== 0) return null;
  }
  const log = r.log as GameRecord[];
  if (r.lastResult !== null && !isRecord(r.lastResult)) return null;

  /* ---- 2. per-phase invariants ---- */
  const drafting = phase === 'start-draft' || phase === 'draft';
  const expectedOffers = drafting ? draftOffers(r.seed, phase === 'start-draft' ? 0 : r.station, held) : [];
  if (JSON.stringify(r.offers) !== JSON.stringify(expectedOffers)) return null;
  if (phase === 'start-draft' && (held.length !== 0 || r.station !== 0 || log.length !== 0)) return null;
  const maxGames = phase === 'result' || phase === 'won' || phase === 'lost' ? station.lanterns : phase === 'playing' ? station.lanterns - 1 : 0;
  const minGames = phase === 'result' || phase === 'won' ? 1 : phase === 'lost' ? station.lanterns : 0;
  if (r.gamesPlayed < minGames || r.gamesPlayed > maxGames) return null;
  const game = r.game === undefined ? null : r.game;
  const hasGame = phase === 'playing' || phase === 'result';
  if (hasGame ? game === null : game !== null) return null;
  if (phase === 'start-draft' && r.lastResult !== null) return null;

  /* ---- 3. the game, replayed through the engine ---- */
  let replay: GameState | null = null;
  if (game !== null) {
    if (!isRecord(game)) return null;
    const g = game;
    if (!Array.isArray(g.board) || g.board.length !== 16 || !Array.isArray(g.history) || g.history.length > 16) return null;
    if (!isPlayer(g.current)) return null;
    if (g.lastTile !== null && !isTile(g.lastTile)) return null;
    for (const cell of g.board as unknown[]) {
      if (!isRecord(cell)) return null;
      if (cell.kind === 'tile' ? !isTile(cell.tile) : cell.kind === 'token' ? !isPlayer(cell.player) : true) return null;
    }
    for (const move of g.history as unknown[]) {
      if (!isRecord(move)) return null;
      if (!isPlayer(move.player) || !isCount(move.index) || move.index >= 16 || !isTile(move.tile)) return null;
    }
    const history = g.history as GameState['history'];
    const first = history[0]?.player ?? (g.current as Player);
    try {
      // Replay from the garden the run deals for this station and game index (not from the saved
      // tiles), so the layout, the tile set and the game index are all pinned by the seed.
      const gameIndex = phase === 'result' ? r.gamesPlayed - 1 : r.gamesPlayed;
      let state = newGame(gameSeed(r.seed, r.station, gameIndex), first);
      for (const m of history) state = applyMove(state, m.index);
      if (JSON.stringify(state) !== JSON.stringify(game)) return null;
      replay = state;
    } catch {
      return null;
    }
    // Who opened this game is dictated by the run, not by the save: the seeded coin toss for the
    // first game, afterwards the loser of the previous game (the last log entry at that time).
    if (phase === 'playing' && first !== requiredOpener(r.seed, log)) return null;
    if (phase === 'result' && (!replay.win || first !== requiredOpener(r.seed, log.slice(0, -1)))) return null;
  }
  // nextFirst is likewise derived, never trusted: the loser of the last logged game opens next.
  if (r.nextFirst !== requiredOpener(r.seed, log)) return null;

  /* ---- 4. the log explains the counters ---- */
  let total = 0;
  const perStation = new Map<number, { count: number; petals: number }>();
  let prevStation = -1;
  for (const e of log) {
    if (e.station < prevStation || e.station > r.station) return null;
    const agg = perStation.get(e.station) ?? { count: 0, petals: 0 };
    if (e.game !== agg.count) return null; // games at a station are numbered 0, 1, 2 in order
    agg.count++;
    agg.petals += e.petals;
    perStation.set(e.station, agg);
    total += e.petals;
    prevStation = e.station;
  }
  if (total !== r.totalPetals) return null;
  const here = perStation.get(r.station) ?? { count: 0, petals: 0 };
  if (here.count !== r.gamesPlayed || here.petals !== r.stationPetals) return null;
  for (let st = 0; st < r.station; st++) {
    const agg = perStation.get(st);
    if (!agg || agg.petals < STATIONS[st].target) return null; // every earlier station was cleared
  }
  if (phase === 'won' && here.petals < station.target) return null;
  if (phase === 'lost' && here.petals >= station.target) return null;
  if (phase === 'result') {
    if (!replay || !replay.win) return null;
    const expected = scoreGame(replay, HUMAN, held);
    if (JSON.stringify(r.lastResult) !== JSON.stringify(expected)) return null;
    const last = log[log.length - 1];
    if (!last || last.station !== r.station || last.game !== r.gamesPlayed - 1 || last.won !== expected.won) return null;
    if (last.petals !== expected.total || last.reason !== replay.win.reason || last.moves !== replay.history.length) return null;
  } else if (phase === 'playing' || log.length === 0) {
    // startGame clears the tally, and before the first game there is none.
    if (r.lastResult !== null) return null;
  } else if (r.lastResult !== null) {
    // A previous game's tally rides along into draft/intro/won/lost: check its shape and that it
    // describes the last logged game.
    const lr = r.lastResult as Record<string, unknown>;
    const last = log[log.length - 1];
    if (lr.won !== last.won || lr.total !== last.petals) return null;
    if (typeof lr.won !== 'boolean' || !isCount(lr.base) || !isCount(lr.tilesRemaining) || !isCount(lr.add) || !isCount(lr.mult) || !isCount(lr.total)) return null;
    if (!Array.isArray(lr.effects)) return null;
    for (const eff of lr.effects as unknown[]) {
      if (!isRecord(eff) || !isRecord(eff.charm) || !isRecord(eff.effect)) return null;
      if (typeof eff.charm.id !== 'string' || !ids.has(eff.charm.id)) return null;
      if (!isCount(eff.effect.add) || !isCount(eff.effect.mult) || typeof eff.effect.note !== 'string') return null;
    }
  }

  // Return a fresh object built from the validated fields, so unknown keys do not ride along.
  return {
    seed: r.seed,
    phase,
    station: r.station,
    gamesPlayed: r.gamesPlayed,
    stationPetals: r.stationPetals,
    held,
    offers: r.offers as CharmId[],
    fireflyUsed: r.fireflyUsed,
    nextFirst: r.nextFirst,
    game: (game as GameState | null),
    lastResult: r.lastResult as PetalBreakdown | null,
    totalPetals: r.totalPetals,
    log,
  };
}

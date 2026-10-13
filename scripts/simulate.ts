/**
 * Simulation harness: seeded games between two move-choosers, alternating who opens.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts calibrate [games=400]   difficulty ladder against three player models
 *   npx tsx scripts/simulate.ts solve [layouts=30]      exact value of random gardens (perfect play)
 *   npx tsx scripts/simulate.ts timing [games=20]       think time per move of each difficulty
 */
import { DIFFICULTY, Searcher, WIN, chooseMove, type AiOptions, type Difficulty } from '../src/engine/ai';
import { applyMove, legalMoves, mulberry32, newGame, type GameState, type Player } from '../src/engine/garden';

export interface Tally {
  games: number;
  /** Wins of side A, of side B, and ties. */
  a: number;
  b: number;
  ties: number;
  aWhenOpening: number;
  aOpened: number;
  reasons: Record<string, number>;
  moves: number;
}

/** Play `games` games between two option sets; A opens the even-numbered games. */
export function playSeries(games: number, a: AiOptions, b: AiOptions, seed: number): Tally {
  const rng = mulberry32(seed);
  const sa = new Searcher();
  const sb = new Searcher();
  const t: Tally = { games, a: 0, b: 0, ties: 0, aWhenOpening: 0, aOpened: 0, reasons: {}, moves: 0 };
  for (let i = 0; i < games; i++) {
    const aSide: Player = i % 2 === 0 ? 1 : 2;
    let g: GameState = newGame(seed * 7919 + i, 1);
    while (!g.result) {
      const mine = g.current === aSide;
      const r = chooseMove(g, { ...(mine ? a : b), rng }, mine ? sa : sb);
      g = applyMove(g, r.index);
    }
    const res = g.result;
    t.moves += g.history.length;
    t.reasons[res.reason] = (t.reasons[res.reason] ?? 0) + 1;
    if (aSide === 1) t.aOpened++;
    if (res.winner === null) t.ties++;
    else if (res.winner === aSide) {
      t.a++;
      if (aSide === 1) t.aWhenOpening++;
    } else t.b++;
  }
  return t;
}

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`.padStart(6);

/** Player models standing in for people, from casual to strong. */
export const MODELS: Record<string, AiOptions> = {
  casual: { depth: 1, blunder: 0.25 },
  thoughtful: { depth: 2 },
  strong: { depth: 4 },
};

function calibrate(games: number): void {
  console.log(`Difficulty ladder: AI level vs player models, ${games} games each, openings alternate.`);
  console.log('AI wins / ties / player wins | AI win when AI opens / when player opens | endings');
  for (const level of Object.keys(DIFFICULTY) as Difficulty[]) {
    for (const [name, model] of Object.entries(MODELS)) {
      const t0 = performance.now();
      const t = playSeries(games, DIFFICULTY[level], model, 2026);
      const aiOpenGames = t.aOpened;
      const aiOpenWins = t.aWhenOpening;
      const playerOpenWins = t.a - aiOpenWins;
      const endings = Object.entries(t.reasons)
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => `${k} ${Math.round((100 * v) / t.games)}%`)
        .join(', ');
      console.log(
        `${level.padEnd(6)} vs ${name.padEnd(10)} ${pct(t.a, t.games)} ${pct(t.ties, t.games)} ${pct(t.b, t.games)} | ${pct(aiOpenWins, aiOpenGames)} ${pct(playerOpenWins, t.games - aiOpenGames)} | ${endings} | avg ${(t.moves / t.games).toFixed(1)} moves, ${((performance.now() - t0) / 1000).toFixed(1)}s`,
      );
    }
  }
}

/** Exact game value from the opener's point of view, by full-depth search. */
function solve(layouts: number): void {
  const s = new Searcher(4_000_000);
  const tally = { opener: 0, second: 0, tie: 0 };
  for (let i = 0; i < layouts; i++) {
    const g = newGame(10_000 + i, 1);
    s.reset();
    s.setDeadline(Infinity);
    const t0 = performance.now();
    const v = s.negamax(g, 16, -Infinity, Infinity, 0);
    const ms = performance.now() - t0;
    const verdict = v >= WIN - 20 ? 'opener' : v <= -(WIN - 20) ? 'second' : v === 0 ? 'tie' : `?${v}`;
    if (verdict === 'opener' || verdict === 'second' || verdict === 'tie') tally[verdict]++;
    console.log(`layout ${10_000 + i}: ${verdict.padEnd(6)} (${(ms / 1000).toFixed(1)}s, ${s.nodes} nodes)`);
  }
  console.log(`With perfect play: opener wins ${tally.opener}, second player wins ${tally.second}, tie ${tally.tie} (of ${layouts})`);
}

function timing(games: number): void {
  for (const level of Object.keys(DIFFICULTY) as Difficulty[]) {
    const times: number[] = [];
    const rng = mulberry32(7);
    const s = new Searcher();
    for (let i = 0; i < games; i++) {
      let g = newGame(500 + i, 1);
      while (!g.result) {
        const t0 = performance.now();
        const r = chooseMove(g, { ...DIFFICULTY[level], rng }, s);
        times.push(performance.now() - t0);
        g = applyMove(g, r.index);
        if (legalMoves(g).length === 0) break;
      }
    }
    times.sort((x, y) => x - y);
    const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(0);
    console.log(`${level.padEnd(6)} ${times.length} moves: median ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${q(1)} ms`);
  }
}

const isMain = process.argv[1] && /simulate\.ts$/.test(process.argv[1]);
if (isMain) {
  const [cmd = 'calibrate', n] = process.argv.slice(2);
  if (cmd === 'calibrate') calibrate(Number(n ?? 400));
  else if (cmd === 'solve') solve(Number(n ?? 30));
  else if (cmd === 'timing') timing(Number(n ?? 20));
  else throw new Error(`unknown command ${cmd}`);
}

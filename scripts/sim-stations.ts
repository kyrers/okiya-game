/**
 * Rival strength per station, measured against an independent "greedy" player:
 *   1. win at once if possible; 2. never hand the rival an immediate win if avoidable;
 *   3. otherwise maximise own open formations (sum of squares of own tokens in formations
 *      without rival tokens, minus the same for the rival); ties broken at random.
 * The greedy player is written here from the rules, not from the AI's search.
 *
 * Usage: npx tsx scripts/sim-stations.ts [games=1000] [before|after|searcher]
 *   searcher = the current stations against a second opponent (depth-2 careless search with 10%
 *   random moves), to check the difficulty curve is not an artefact of the greedy player
 *   before = the station settings of commit d129887 (all rivals careless, the old behaviour)
 *   after  = the current src/game/stations.ts
 */
import { chooseMove, Searcher, type AiOptions } from '../src/engine/ai';
import { FORMATIONS, applyMove, legalMoves, mulberry32, newGame, type GameState, type Player } from '../src/engine/okiya';
import { STATIONS } from '../src/game/stations';

const BEFORE: { name: string; ai: AiOptions }[] = [
  { name: 'Haru', ai: { depth: 1, blunder: 0.35, careless: true } },
  { name: 'Ume', ai: { depth: 1, blunder: 0.15, careless: true } },
  { name: 'Natsu', ai: { depth: 2, blunder: 0.15, careless: true } },
  { name: 'Kaede', ai: { depth: 2, blunder: 0.05, careless: true } },
  { name: 'Aki', ai: { depth: 3, blunder: 0.05, careless: true } },
  { name: 'Okasan', ai: { depth: 4, blunder: 0.03, careless: true } },
];

function greedyScore(state: GameState, me: Player): number {
  let s = 0;
  for (const f of FORMATIONS) {
    let mine = 0;
    let theirs = 0;
    for (const i of f.cells) {
      const c = state.board[i];
      if (c.kind === 'token') c.player === me ? mine++ : theirs++;
    }
    if (theirs === 0) s += mine * mine;
    else if (mine === 0) s -= theirs * theirs;
  }
  return s;
}

export function greedyMove(state: GameState, rng: () => number): number {
  const me = state.current;
  const moves = legalMoves(state);
  const wins = moves.filter((m) => applyMove(state, m).win);
  if (wins.length) return wins[Math.floor(rng() * wins.length)];
  const safe = moves.filter((m) => {
    const next = applyMove(state, m);
    return !legalMoves(next).some((r) => applyMove(next, r).win);
  });
  const pool = safe.length ? safe : moves;
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const m of pool) {
    const sc = greedyScore(applyMove(state, m), me);
    if (sc > bestScore) { bestScore = sc; best = [m]; }
    else if (sc === bestScore) best.push(m);
  }
  return best[Math.floor(rng() * best.length)];
}

/**
 * Did the rival, to move, have an immediate win or a safe move available, and what did it do?
 * This mirrors the one-ply definitions used by the AI's own guard (tactics() in ai.ts), written
 * here from legalMoves/applyMove: zero counts therefore verify that the guard is honoured, not
 * the rival's deeper strength. The classifier is live: the careless station-1 rival trips it.
 */
function classifyRivalMove(state: GameState, chosen: number): 'won' | 'missed-win' | 'safe' | 'handed-win' | 'forced' {
  const moves = legalMoves(state);
  const winning = moves.filter((m) => applyMove(state, m).win);
  if (winning.includes(chosen)) return 'won';
  if (winning.length) return 'missed-win';
  const loses = (m: number) => {
    const next = applyMove(state, m);
    return legalMoves(next).some((r) => applyMove(next, r).win);
  };
  const safe = moves.filter((m) => !loses(m));
  if (!safe.length) return 'forced';
  return loses(chosen) ? 'handed-win' : 'safe';
}

interface Row {
  name: string;
  games: number;
  rivalWins: number;
  /** Rival wins split by who opened the game (the run's loser-opens rule makes this matter). */
  rivalWinsHumanOpened: number;
  rivalWinsRivalOpened: number;
  greedyBy: Record<string, number>;
  missedWins: number;
  handedWins: number;
  rivalMoves: number;
  avgMoves: number;
  msPerMove: number;
}

/** A second, different opponent: a shallow careless searcher that blunders 10% of the time. */
export function searcherMove(state: GameState, rng: () => number, searcher: Searcher): number {
  return chooseMove(state, { depth: 2, blunder: 0.1, careless: true, rng }, searcher).index;
}

export function measure(name: string, ai: AiOptions, games: number, seedBase: number, opponent: 'greedy' | 'searcher' = 'greedy'): Row {
  const searcher = new Searcher();
  const humanSearcher = new Searcher();
  const row: Row = { name, games, rivalWins: 0, rivalWinsHumanOpened: 0, rivalWinsRivalOpened: 0, greedyBy: {}, missedWins: 0, handedWins: 0, rivalMoves: 0, avgMoves: 0, msPerMove: 0 };
  let totalMoves = 0;
  let aiMs = 0;
  for (let i = 0; i < games; i++) {
    const rng = mulberry32(seedBase + i * 7919);
    const first: Player = ((i & 1) + 1) as Player;
    let g = newGame(seedBase + i, first);
    while (!g.win) {
      if (g.current === 1) {
        g = applyMove(g, opponent === 'greedy' ? greedyMove(g, rng) : searcherMove(g, rng, humanSearcher));
      } else {
        const t0 = performance.now();
        const idx = chooseMove(g, { ...ai, rng }, searcher).index;
        aiMs += performance.now() - t0;
        const cls = classifyRivalMove(g, idx);
        if (cls === 'missed-win') row.missedWins++;
        if (cls === 'handed-win') row.handedWins++;
        row.rivalMoves++;
        g = applyMove(g, idx);
      }
    }
    totalMoves += g.history.length;
    if (g.win!.winner === 2) {
      row.rivalWins++;
      if (first === 1) row.rivalWinsHumanOpened++;
      else row.rivalWinsRivalOpened++;
    } else row.greedyBy[g.win!.reason] = (row.greedyBy[g.win!.reason] ?? 0) + 1;
  }
  row.avgMoves = totalMoves / games;
  row.msPerMove = aiMs / row.rivalMoves;
  return row;
}

export function report(rows: Row[]): string {
  const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  const lines = ['  station  rival     rival win%  (human opens / rival opens)  greedy wins by (row/col/diag/square/block)   rival missed wins  rival handed wins  avg moves  ms/move'];
  rows.forEach((r, i) => {
    const by = ['row', 'column', 'diagonal', 'square', 'blocked'].map((k) => r.greedyBy[k] ?? 0).join('/');
    const half = r.games / 2;
    lines.push(`  ${String(i + 1).padStart(7)}  ${r.name.padEnd(8)}  ${pct(r.rivalWins, r.games).padStart(9)}  ${`(${pct(r.rivalWinsHumanOpened, half)} / ${pct(r.rivalWinsRivalOpened, half)})`.padEnd(27)}  ${by.padEnd(42)}  ${String(r.missedWins).padStart(17)}  ${String(r.handedWins).padStart(17)}  ${r.avgMoves.toFixed(1).padStart(9)}  ${r.msPerMove.toFixed(1).padStart(7)}`);
  });
  return lines.join('\n');
}

const isMain = process.argv[1] && /sim-stations\.ts$/.test(process.argv[1]);
if (isMain) {
  const [gamesArg = '1000', which = 'after'] = process.argv.slice(2);
  const games = Number(gamesArg);
  const configs = which === 'before' ? BEFORE : STATIONS.map((s) => ({ name: s.rival.name, ai: s.ai }));
  const opponent = which === 'searcher' ? 'searcher' : 'greedy';
  console.log(`${which.toUpperCase()}: ${opponent === 'greedy' ? 'greedy player' : 'depth-2 careless searcher (10% random)'} in the human seat vs each station rival, ${games} games per station, alternating opener`);
  const rows = configs.map((c, i) => measure(c.name, c.ai, games, 100_000 * (i + 1), opponent));
  console.log(report(rows));
}

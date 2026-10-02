/**
 * Playtest of idea B (Okiya Koi-Koi), amended so that declining a Koi-Koi call
 * pays the caller immediately and the game still plays to its official end.
 *
 * Usage: npx tsx scripts/sim-koikoi.ts [matches=300] [depth=2]
 */
import { chooseMove, Searcher, WIN } from '../src/engine/ai';
import { applyMove, mulberry32, newGame, opponent, type GameState, type Player, type Tile } from '../src/engine/okiya';

type Yaku = 'seasons' | 'grove' | 'weather';
const YAKU_MON: Record<Yaku, number> = { seasons: 3, grove: 5, weather: 5 };

function yakuOf(hand: Tile[]): Yaku[] {
  const out: Yaku[] = [];
  const vegs = new Map<string, number>();
  const syms = new Map<string, number>();
  for (const t of hand) {
    vegs.set(t.veg, (vegs.get(t.veg) ?? 0) + 1);
    syms.set(t.sym, (syms.get(t.sym) ?? 0) + 1);
  }
  if ([...vegs.values()].some((n) => n === 4)) out.push('grove');
  if ([...syms.values()].some((n) => n === 4)) out.push('weather');
  // Four Seasons: 4 tiles with 4 distinct vegetations and 4 distinct symbols (a "transversal").
  if (vegs.size === 4 && syms.size === 4 && hasTransversal(hand)) out.push('seasons');
  return out;
}

function hasTransversal(hand: Tile[]): boolean {
  const vegs = ['maple', 'cherry', 'pine', 'iris'];
  const syms = ['sun', 'poem', 'bird', 'rain'];
  // Try to pick one tile per vegetation with all-different symbols (backtracking, tiny).
  const byVeg = vegs.map((v) => hand.filter((t) => t.veg === v));
  const used = new Set<string>();
  const rec = (i: number): boolean => {
    if (i === 4) return true;
    for (const t of byVeg[i]) {
      if (used.has(t.sym)) continue;
      used.add(t.sym);
      if (rec(i + 1)) return true;
      used.delete(t.sym);
    }
    return false;
  };
  return syms.length === 4 && rec(0);
}

type CallPolicy = 'never' | 'always' | 'threshold';
type AcceptPolicy = 'always' | 'threshold';
interface Policy { depth: number; call: CallPolicy; accept: AcceptPolicy; collector: boolean }

const searcher = new Searcher();

function winChance(g: GameState, me: Player, rng: () => number): number {
  // Decisive search result → 0/1, else playouts.
  const r = chooseMove(g, { depth: 2, rng }, searcher);
  if (g.current === me && r.score >= WIN - 20) return 1;
  if (g.current === me && r.score <= -(WIN - 20)) return 0;
  const K = 16;
  let w = 0;
  for (let k = 0; k < K; k++) {
    let s = g;
    while (!s.win) s = applyMove(s, chooseMove(s, { depth: 1, blunder: 0.15, rng }, searcher).index);
    if (s.win!.winner === me) w++;
  }
  return w / K;
}

function handValue(hand: Tile[]): number {
  const vegs = new Map<string, number>();
  const syms = new Map<string, number>();
  for (const t of hand) {
    vegs.set(t.veg, (vegs.get(t.veg) ?? 0) + 1);
    syms.set(t.sym, (syms.get(t.sym) ?? 0) + 1);
  }
  return Math.max(0, ...vegs.values(), ...syms.values()) + (vegs.size + syms.size) * 0.25;
}

interface GameLog {
  winner: Player;
  mon: Record<Player, number>;
  yaku: Record<Player, Yaku[]>;
  calls: number;
  accepted: number;
  declined: number;
  moves: number;
}

function playGame(seed: number, first: Player, pol: Record<Player, Policy>, rng: () => number): GameLog {
  let g = newGame(seed, first);
  const hands: Record<Player, Tile[]> = { 1: [], 2: [] };
  const yaku: Record<Player, Yaku[]> = { 1: [], 2: [] };
  const called: Record<Player, boolean> = { 1: false, 2: false };
  const mon: Record<Player, number> = { 1: 0, 2: 0 };
  let stake = 1;
  let calls = 0, accepted = 0, declined = 0;
  while (!g.win) {
    const p = g.current;
    const P = pol[p];
    const r = chooseMove(g, { depth: P.depth, rng }, searcher);
    let idx = r.index;
    if (P.collector) {
      const max = Math.max(...r.scores);
      const cands = r.moves.filter((_, i) => r.scores[i] >= max - 2);
      let best = -Infinity;
      for (const m of cands) {
        const tile = (g.board[m] as { tile: Tile }).tile;
        const v = handValue([...hands[p], tile]);
        if (v > best) { best = v; idx = m; }
      }
    }
    const tile = (g.board[idx] as { tile: Tile }).tile;
    g = applyMove(g, idx);
    hands[p].push(tile);
    const nowYaku = yakuOf(hands[p]);
    const fresh = nowYaku.filter((y) => !yaku[p].includes(y));
    yaku[p] = nowYaku;
    if (fresh.length && !g.win && !called[p]) {
      const wantCall = P.call === 'always' || (P.call === 'threshold' && winChance(g, p, rng) >= 0.6);
      if (wantCall) {
        called[p] = true;
        calls++;
        const o = opponent(p);
        const O = pol[o];
        const acc = O.accept === 'always' || winChance(g, o, rng) >= 0.25;
        if (acc) { stake *= 2; accepted++; }
        else {
          declined++;
          mon[p] += (3 + yaku[p].reduce((n, y) => n + YAKU_MON[y], 0)) * stake;
        }
      }
    }
  }
  const w = g.win!.winner;
  mon[w] += (3 + g.win!.tilesRemaining + yaku[w].reduce((n, y) => n + YAKU_MON[y], 0)) * stake;
  return { winner: w, mon, yaku, calls, accepted, declined, moves: g.history.length };
}

function playMatch(seed: number, pol: Record<Player, Policy>, rng: () => number) {
  const total: Record<Player, number> = { 1: 0, 2: 0 };
  let first: Player = ((seed & 1) + 1) as Player;
  const logs: GameLog[] = [];
  let games = 0;
  while (total[1] < 30 && total[2] < 30 && games < 30) {
    const log = playGame(seed * 100 + games, first, pol, rng);
    logs.push(log);
    total[1] += log.mon[1];
    total[2] += log.mon[2];
    first = opponent(log.winner);
    games++;
  }
  return { winner: (total[1] >= 30 ? 1 : 2) as Player, games, logs };
}

const [matchesArg = '300', depthArg = '2'] = process.argv.slice(2);
const MATCHES = Number(matchesArg);
const D = Number(depthArg);
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;

function experiment(label: string, a: Policy, b: Policy) {
  const rng = mulberry32(7);
  let aWins = 0, games = 0, gamesWonA = 0, yakuAny = 0, winnerHasYaku = 0, grove = 0, weather = 0, seasons = 0, calls = 0, accepted = 0, declined = 0, moves = 0, oneGame = 0;
  const lenHist: Record<number, number> = {};
  for (let i = 0; i < MATCHES; i++) {
    // Alternate seats so neither policy always sits as player 1.
    const aSeat: Player = ((i % 2) + 1) as Player;
    const pol = { [aSeat]: a, [opponent(aSeat)]: b } as Record<Player, Policy>;
    const m = playMatch(1000 + i, pol, rng);
    if (m.winner === aSeat) aWins++;
    lenHist[m.games] = (lenHist[m.games] ?? 0) + 1;
    if (m.games === 1) oneGame++;
    for (const l of m.logs) {
      games++;
      if (l.winner === aSeat) gamesWonA++;
      const any = l.yaku[1].length + l.yaku[2].length > 0;
      if (any) yakuAny++;
      if (l.yaku[l.winner].length) winnerHasYaku++;
      for (const p of [1, 2] as Player[]) {
        if (l.yaku[p].includes('grove')) grove++;
        if (l.yaku[p].includes('weather')) weather++;
        if (l.yaku[p].includes('seasons')) seasons++;
      }
      calls += l.calls; accepted += l.accepted; declined += l.declined; moves += l.moves;
    }
  }
  console.log(`\n== ${label} (${MATCHES} matches, ${games} games)`);
  console.log(`  A wins ${pct(aWins, MATCHES)} of matches, ${pct(gamesWonA, games)} of games; games/match hist ${Object.entries(lenHist).map(([k, v]) => `${k}:${v}`).join(' ')}; decided in 1 game ${pct(oneGame, MATCHES)}`);
  console.log(`  yaku in game ${pct(yakuAny, games)}; winner holds yaku ${pct(winnerHasYaku, games)}; per game: seasons ${pct(seasons, games)} grove ${pct(grove, games)} weather ${pct(weather, games)}`);
  console.log(`  Koi calls/game ${(calls / games).toFixed(2)} (accepted ${accepted}, declined ${declined}); avg moves ${(moves / games).toFixed(1)}`);
}

const board: Policy = { depth: D, call: 'never', accept: 'always', collector: false };
console.log(`Koi-Koi playtest (amended: decline pays, game continues). depth ${D}`);
experiment('Board vs Board (baseline yaku frequencies)', board, board);
experiment('Collector vs Board', { ...board, collector: true }, board);
experiment('Always-call/always-accept vs Board', { ...board, call: 'always' }, board);
experiment('Threshold-call/threshold-accept vs Board', { ...board, call: 'threshold', accept: 'threshold' }, board);
experiment('Threshold vs Always', { ...board, call: 'threshold', accept: 'threshold' }, { ...board, call: 'always' });

/**
 * Okiya simulation harness: AI vs AI over many seeded games.
 *
 * Usage: npx tsx scripts/simulate.ts [games=200] [depthP1=4] [depthP2=4] [blunderP1=0] [blunderP2=0]
 */
import { chooseMove, Searcher } from '../src/engine/ai';
import { applyMove, mulberry32, newGame, type GameState, type WinInfo } from '../src/engine/okiya';

export interface SimConfig {
  games: number;
  depth: [number, number];
  blunder: [number, number];
  seed: number;
  timeMs?: number;
}

export interface SimResult {
  games: number;
  wins: Record<1 | 2, number>;
  firstPlayerWins: number;
  reasons: Record<string, number>;
  avgMoves: number;
  movesHist: Record<number, number>;
  tilesRemainingHist: Record<number, number>;
  avgTilesRemaining: number;
  ms: number;
}

export function playGame(seed: number, cfg: SimConfig, rng: () => number, searcher: Searcher): GameState {
  let g = newGame(seed, (seed % 2) + 1 as 1 | 2);
  while (!g.win) {
    const p = g.current;
    const r = chooseMove(g, { depth: cfg.depth[p - 1], blunder: cfg.blunder[p - 1], rng, timeMs: cfg.timeMs }, searcher);
    g = applyMove(g, r.index);
  }
  return g;
}

export function simulate(cfg: SimConfig): SimResult {
  const t0 = performance.now();
  const rng = mulberry32(cfg.seed);
  const searcher = new Searcher();
  const res: SimResult = {
    games: cfg.games,
    wins: { 1: 0, 2: 0 },
    firstPlayerWins: 0,
    reasons: {},
    avgMoves: 0,
    movesHist: {},
    tilesRemainingHist: {},
    avgTilesRemaining: 0,
    ms: 0,
  };
  let totalMoves = 0;
  let totalRemaining = 0;
  for (let i = 0; i < cfg.games; i++) {
    const g = playGame(cfg.seed * 1000 + i, cfg, rng, searcher);
    const win = g.win as WinInfo;
    const first = g.history[0].player;
    res.wins[win.winner]++;
    if (win.winner === first) res.firstPlayerWins++;
    res.reasons[win.reason] = (res.reasons[win.reason] ?? 0) + 1;
    totalMoves += g.history.length;
    res.movesHist[g.history.length] = (res.movesHist[g.history.length] ?? 0) + 1;
    res.tilesRemainingHist[win.tilesRemaining] = (res.tilesRemainingHist[win.tilesRemaining] ?? 0) + 1;
    totalRemaining += win.tilesRemaining;
  }
  res.avgMoves = totalMoves / cfg.games;
  res.avgTilesRemaining = totalRemaining / cfg.games;
  res.ms = performance.now() - t0;
  return res;
}

export function report(label: string, r: SimResult): string {
  const pct = (n: number) => `${((100 * n) / r.games).toFixed(1)}%`;
  const hist = (h: Record<number, number>) =>
    Object.keys(h)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => `${k}:${h[k]}`)
      .join(' ');
  return [
    `== ${label} (${r.games} games, ${(r.ms / 1000).toFixed(1)}s)`,
    `  P1 wins ${pct(r.wins[1])}  P2 wins ${pct(r.wins[2])}  first-mover wins ${pct(r.firstPlayerWins)}`,
    `  reasons: ${Object.entries(r.reasons)
      .map(([k, v]) => `${k} ${pct(v)}`)
      .join(', ')}`,
    `  avg moves ${r.avgMoves.toFixed(2)}  hist ${hist(r.movesHist)}`,
    `  avg tiles remaining (VP) ${r.avgTilesRemaining.toFixed(2)}  hist ${hist(r.tilesRemainingHist)}`,
  ].join('\n');
}

const isMain = process.argv[1] && /simulate\.ts$/.test(process.argv[1]);
if (isMain) {
  const [games = '200', d1 = '4', d2 = '4', b1 = '0', b2 = '0'] = process.argv.slice(2);
  const cfg: SimConfig = {
    games: Number(games),
    depth: [Number(d1), Number(d2)],
    blunder: [Number(b1), Number(b2)],
    seed: 2026,
  };
  console.log(report(`depth ${d1} vs ${d2}, blunder ${b1}/${b2}`, simulate(cfg)));
}

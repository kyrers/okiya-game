/**
 * Playtest of idea A (Hanamichi) by simulation.
 *
 *  - "Blind" player: plays to win only (best negamax score, first max).
 *  - "Charm" player: among moves within TOL of the best score (or all winning
 *    moves), picks the one that best advances the charms it holds.
 *  Both are scored with the same charms, so the difference is purely how the
 *  charms change play. Rival = negamax at a depth with an epsilon of random moves.
 *
 * Usage: npx tsx scripts/sim-hanamichi.ts [games=400] [playerDepth=2] [rivalDepth=2] [rivalEps=0.1]
 */
import { chooseMove, Searcher, WIN } from '../src/engine/ai';
import { CHARMS, scoreGame, type CharmId } from '../src/engine/charms';
import { applyMove, legalMoves, mulberry32, newGame, FORMATIONS, CENTRE_CELLS, type GameState, type Player } from '../src/engine/okiya';

const TOL = Number(process.env.TOL ?? '2');
/** Who moves first: decoupled from who the player is (seed bit 1). */
function firstMover(seed: number): Player {
  return (((seed >> 1) & 1) + 1) as Player;
}

function charmHeuristic(prev: GameState, next: GameState, me: Player, held: readonly CharmId[]): number {
  let h = 0;
  const move = next.history[next.history.length - 1];
  const prevTile = prev.lastTile;
  const matchedBySymbol = prevTile !== null && prevTile.sym === move.tile.sym;
  const replies = next.win ? 0 : legalMoves(next).length;
  const mine = (i: number) => next.board[i].kind === 'token' && (next.board[i] as { player: Player }).player === me;
  for (const id of held) {
    switch (id) {
      case 'corner-shrine':
        h += 2 * [0, 3, 12, 15].filter(mine).length;
        break;
      case 'heart-stone': {
        const n = CENTRE_CELLS.filter(mine).length;
        h += n >= 2 ? 6 : 2 * n;
        break;
      }
      case 'rain-chain':
        h += next.history.filter((m, i) => m.player === me && i > 0 && next.history[i - 1].tile.sym === m.tile.sym).length;
        if (matchedBySymbol) h += 0.5;
        break;
      case 'narrow-gate':
        if (replies === 1) h += 3;
        break;
      case 'stone-lantern':
      case 'bamboo-fence':
      case 'crane-scroll': {
        const want = id === 'stone-lantern' ? ['square'] : id === 'bamboo-fence' ? ['row', 'column'] : ['diagonal'];
        for (const f of FORMATIONS) {
          if (!want.includes(f.reason)) continue;
          let m = 0;
          let theirs = 0;
          for (const i of f.cells) {
            const c = next.board[i];
            if (c.kind === 'token') c.player === me ? m++ : theirs++;
          }
          if (theirs === 0 && m >= 2) h += m;
        }
        break;
      }
      case 'thorn-hedge':
        h += Math.max(0, 6 - replies) * 0.5;
        break;
      default:
        break;
    }
  }
  return h;
}

interface Pick {
  index: number;
  blindIndex: number;
  sacrificed: boolean;
}

function pickMove(state: GameState, me: Player, depth: number, held: readonly CharmId[], searcher: Searcher, rng: () => number): Pick {
  const r = chooseMove(state, { depth, rng }, searcher);
  const max = Math.max(...r.scores);
  const blindIndex = r.moves[r.scores.indexOf(max)];
  let candidates: number[];
  if (max >= WIN - 20) candidates = r.moves.filter((_, i) => r.scores[i] >= WIN - 20);
  else if (max <= -(WIN - 20)) candidates = r.moves.slice();
  else candidates = r.moves.filter((_, i) => r.scores[i] >= max - TOL);
  if (held.length === 0) return { index: blindIndex, blindIndex, sacrificed: false };
  let best = candidates[0];
  let bestH = -Infinity;
  for (const m of candidates) {
    const h = charmHeuristic(state, applyMove(state, m), me, held);
    if (h > bestH) {
      bestH = h;
      best = m;
    }
  }
  const chosenScore = r.scores[r.moves.indexOf(best)];
  return { index: best, blindIndex, sacrificed: chosenScore < max };
}

interface GameStats {
  won: boolean;
  petals: number;
  moves: number;
  changed: number;
  sacrificed: number;
  myMoves: number;
  reason: string;
}

function playGame(seed: number, me: Player, depth: number, held: readonly CharmId[], rival: { depth: number; eps: number }, searcher: Searcher, rng: () => number): GameStats {
  let g = newGame(seed, firstMover(seed));
  let changed = 0;
  let sacrificed = 0;
  let myMoves = 0;
  while (!g.win) {
    if (g.current === me) {
      const p = pickMove(g, me, depth, held, searcher, rng);
      if (p.index !== p.blindIndex) changed++;
      if (p.sacrificed) sacrificed++;
      myMoves++;
      g = applyMove(g, p.index);
    } else {
      const r = chooseMove(g, { depth: rival.depth, blunder: rival.eps, rng }, searcher);
      g = applyMove(g, r.index);
    }
  }
  const s = scoreGame(g, me, held);
  return { won: s.won, petals: s.total, moves: g.history.length, changed, sacrificed, myMoves, reason: g.win!.reason };
}

function pct(n: number, d: number): string {
  return `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
}

const [gamesArg = '400', pdArg = '2', rdArg = '2', epsArg = '0.1'] = process.argv.slice(2);
const GAMES = Number(gamesArg);
const PD = Number(pdArg);
const RIVAL = { depth: Number(rdArg), eps: Number(epsArg) };
const searcher = new Searcher();
const rng = mulberry32(99);

console.log(`Hanamichi playtest: ${GAMES} games per experiment, player depth ${PD}, rival depth ${RIVAL.depth} eps ${RIVAL.eps}, TOL ${TOL}`);

// Experiment 1: Blind vs Charm with 3 random charms each game (same charms, same seeds).
{
  const allIds = CHARMS.map((c) => c.id);
  let blindPetals = 0, charmPetals = 0, blindWins = 0, charmWins = 0, changed = 0, sacrificed = 0, myMoves = 0;
  for (let i = 0; i < GAMES; i++) {
    const seed = 5000 + i;
    const me = ((i % 2) + 1) as Player;
    const held: CharmId[] = [];
    const pool = allIds.slice();
    const r2 = mulberry32(seed);
    while (held.length < 3) held.push(pool.splice(Math.floor(r2() * pool.length), 1)[0]);
    const b = playGame(seed, me, PD, [], RIVAL, searcher, mulberry32(seed));
    const bScored = scoreGameFromStats(b, seed, me, PD, held, searcher);
    const c = playGame(seed, me, PD, held, RIVAL, searcher, mulberry32(seed));
    blindPetals += bScored; charmPetals += c.petals;
    if (b.won) blindWins++;
    if (c.won) charmWins++;
    changed += c.changed; sacrificed += c.sacrificed; myMoves += c.myMoves;
  }
  console.log(`\n[1] Blind-${PD} vs Charm-${PD}, 3 random charms, same seeds`);
  console.log(`  win rate: blind ${pct(blindWins, GAMES)}  charm ${pct(charmWins, GAMES)}`);
  console.log(`  petals/game: blind ${(blindPetals / GAMES).toFixed(2)}  charm ${(charmPetals / GAMES).toFixed(2)}  (gain ${pct(charmPetals - blindPetals, blindPetals)})`);
  console.log(`  decision-change rate: ${pct(changed, myMoves)} of the charm player's moves differ from blind; ${pct(sacrificed, myMoves)} give up search score`);
}

// Blind replays the same game and is scored with `held` (charms affect scoring only).
function scoreGameFromStats(_b: GameStats, seed: number, me: Player, depth: number, held: readonly CharmId[], s: Searcher): number {
  // Replay deterministically: same seed/rng → same game as `b`.
  let g = newGame(seed, firstMover(seed));
  const r = mulberry32(seed);
  while (!g.win) {
    if (g.current === me) g = applyMove(g, pickMove(g, me, depth, [], s, r).index);
    else g = applyMove(g, chooseMove(g, { depth: RIVAL.depth, blunder: RIVAL.eps, rng: r }, s).index);
  }
  return scoreGame(g, me, held).total;
}

// Experiment 2: each charm alone — fire rate when won, average add, win-rate effect.
{
  console.log(`\n[2] Each charm held alone (${Math.floor(GAMES / 2)} games each)`);
  console.log(`  charm            win%   fired%(of wins)  petals/game  petals/win  changed%`);
  const n = Math.floor(GAMES / 2);
  const rows: { id: string; winRate: number; fire: number; ppg: number; ppw: number; changed: number }[] = [];
  for (const charm of CHARMS) {
    let wins = 0, fired = 0, petals = 0, changed = 0, myMoves = 0;
    for (let i = 0; i < n; i++) {
      const seed = 9000 + i;
      const me = ((i % 2) + 1) as Player;
      const g = playGame(seed, me, PD, [charm.id], RIVAL, searcher, mulberry32(seed));
      if (g.won) {
        wins++;
        if (g.petals > 0) {
          // did the charm fire? petals > base + tiles remaining
          const base = 3; // BASE_PETALS
          const baseline = base + tilesFromPetals(g); // placeholder, recomputed below
          void baseline;
        }
      }
      petals += g.petals; changed += g.changed; myMoves += g.myMoves;
      // Fire detection via rescoring without charm:
      fired += g.won && g.petals !== rescoreWithout(seed, me, PD, charm.id, searcher) ? 1 : 0;
    }
    rows.push({ id: charm.id, winRate: wins / n, fire: wins ? fired / wins : 0, ppg: petals / n, ppw: wins ? petals / wins : 0, changed: changed / myMoves });
  }
  for (const r of rows) console.log(`  ${r.id.padEnd(16)} ${(100 * r.winRate).toFixed(1).padStart(5)}  ${(100 * r.fire).toFixed(1).padStart(8)}        ${r.ppg.toFixed(2).padStart(6)}      ${r.ppw.toFixed(2).padStart(6)}     ${(100 * r.changed).toFixed(1)}`);
}

function tilesFromPetals(_g: GameStats): number { return 0; }

function rescoreWithout(seed: number, me: Player, depth: number, id: CharmId, s: Searcher): number {
  let g = newGame(seed, firstMover(seed));
  const r = mulberry32(seed);
  while (!g.win) {
    if (g.current === me) g = applyMove(g, pickMove(g, me, depth, [id], s, r).index);
    else g = applyMove(g, chooseMove(g, { depth: RIVAL.depth, blunder: RIVAL.eps, rng: r }, s).index);
  }
  return scoreGame(g, me, []).total;
}

// Experiment 3: no charms, petals distribution (base 3 + tiles remaining) — what a win is worth.
{
  let petals = 0, wins = 0;
  const hist: Record<number, number> = {};
  for (let i = 0; i < GAMES; i++) {
    const seed = 12000 + i;
    const me = ((i % 2) + 1) as Player;
    const g = playGame(seed, me, PD, [], RIVAL, searcher, mulberry32(seed));
    if (g.won) { wins++; petals += g.petals; hist[g.petals] = (hist[g.petals] ?? 0) + 1; }
  }
  console.log(`\n[3] No charms: win ${pct(wins, GAMES)}, petals/win ${(petals / Math.max(1, wins)).toFixed(2)}, hist ${Object.entries(hist).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}

// Experiment 4: petal-aware search. The charm player's negamax values a won game at
// WIN + petals (so it chooses among wins by petals and prefers charm-rich wins it can see).
{
  const allIds = CHARMS.map((c) => c.id);
  let blindPetals = 0, charmPetals = 0, blindWins = 0, charmWins = 0, changed = 0, myMoves = 0;
  const zero = () => 0;
  for (let i = 0; i < GAMES; i++) {
    const seed = 15000 + i;
    const me = ((i % 2) + 1) as Player;
    const held: CharmId[] = [];
    const pool = allIds.slice();
    const r2 = mulberry32(seed);
    while (held.length < 3) held.push(pool.splice(Math.floor(r2() * pool.length), 1)[0]);
    const petalSearcher = new Searcher(2_000_000, (st) => (st.win && st.win.winner === me ? scoreGame(st, me, held).total : 0));
    const play = (aware: boolean) => {
      let g = newGame(seed, firstMover(seed));
      const r = mulberry32(seed);
      let myCount = 0, diff = 0;
      while (!g.win) {
        if (g.current === me) {
          const blind = chooseMove(g, { depth: PD, rng: zero }, searcher).index;
          const idx = aware ? chooseMove(g, { depth: PD, rng: zero }, petalSearcher).index : blind;
          if (idx !== blind) diff++;
          myCount++;
          g = applyMove(g, idx);
        } else {
          g = applyMove(g, chooseMove(g, { depth: RIVAL.depth, blunder: RIVAL.eps, rng: r }, searcher).index);
        }
      }
      return { score: scoreGame(g, me, held), diff, myCount };
    };
    const b = play(false);
    const c = play(true);
    blindPetals += b.score.total; charmPetals += c.score.total;
    if (b.score.won) blindWins++;
    if (c.score.won) charmWins++;
    changed += c.diff; myMoves += c.myCount;
  }
  console.log(`\n[4] Petal-aware search (depth ${PD}) vs blind search, 3 random charms, same seeds`);
  console.log(`  win rate: blind ${pct(blindWins, GAMES)}  aware ${pct(charmWins, GAMES)}`);
  console.log(`  petals/game: blind ${(blindPetals / GAMES).toFixed(2)}  aware ${(charmPetals / GAMES).toFixed(2)}  (gain ${pct(charmPetals - blindPetals, blindPetals)})`);
  console.log(`  decision-change rate: ${pct(changed, myMoves)} of the aware player's moves differ from blind`);
}
void rng;

// Experiment 5: expected-value player. For each candidate move (within TOL_EV of the best
// search score), run K playouts (both sides depth 1 with noise) and pick the move with the
// highest average petals. SCALE multiplies every charm payout to test "charms worth more".
{
  const K = Number(process.env.K ?? '12');
  const TOL_EV = Number(process.env.TOL_EV ?? '6');
  const SCALE = Number(process.env.SCALE ?? '1');
  /** CONTROL=1: the EV player optimises base petals only (charms x0) but is SCORED with charms x1,
   *  isolating the effect of charm pursuit from the extra strength that playouts add. */
  const CONTROL = process.env.CONTROL === '1';
  const allIds = CHARMS.map((c) => c.id);
  const zero = () => 0;
  const scaledWith = (st: GameState, me: Player, held: readonly CharmId[], scale: number) => {
    const s = scoreGame(st, me, held);
    if (!s.won) return 0;
    return (s.base + s.tilesRemaining + scale * s.add) * (1 + scale * s.mult);
  };
  const scaled = (st: GameState, me: Player, held: readonly CharmId[]) => scaledWith(st, me, held, CONTROL ? 0 : SCALE);
  const reportScore = (st: GameState, me: Player, held: readonly CharmId[]) => scaledWith(st, me, held, SCALE);
  const playout = (g0: GameState, me: Player, held: readonly CharmId[], r: () => number) => {
    let g = g0;
    while (!g.win) g = applyMove(g, chooseMove(g, { depth: 1, blunder: 0.15, rng: r }, searcher).index);
    return scaled(g, me, held);
  };
  let blindPetals = 0, evPetals = 0, blindWins = 0, evWins = 0, changed = 0, myMoves = 0;
  for (let i = 0; i < GAMES; i++) {
    const seed = 18000 + i;
    const me = ((i % 2) + 1) as Player;
    const held: CharmId[] = [];
    const pool = allIds.slice();
    const r2 = mulberry32(seed);
    while (held.length < 3) held.push(pool.splice(Math.floor(r2() * pool.length), 1)[0]);
    const play = (ev: boolean) => {
      let g = newGame(seed, firstMover(seed));
      const r = mulberry32(seed);
      let myCount = 0, diff = 0;
      while (!g.win) {
        if (g.current === me) {
          const res = chooseMove(g, { depth: PD, rng: zero }, searcher);
          const max = Math.max(...res.scores);
          let idx = res.moves[res.scores.indexOf(max)];
          if (ev) {
            const cands = max >= WIN - 20 ? res.moves.filter((_, j) => res.scores[j] >= WIN - 20) : res.moves.filter((_, j) => res.scores[j] >= max - TOL_EV);
            if (cands.length > 1) {
              let bestV = -Infinity;
              for (const m of cands) {
                const next = applyMove(g, m);
                let v = 0;
                const pr = mulberry32(seed * 31 + m);
                for (let k = 0; k < K; k++) v += playout(next, me, held, pr);
                v /= K;
                if (v > bestV) { bestV = v; idx = m; }
              }
            }
          }
          if (idx !== res.moves[res.scores.indexOf(max)]) diff++;
          myCount++;
          g = applyMove(g, idx);
        } else {
          g = applyMove(g, chooseMove(g, { depth: RIVAL.depth, blunder: RIVAL.eps, rng: r }, searcher).index);
        }
      }
      return { petals: reportScore(g, me, held), won: g.win!.winner === me, diff, myCount };
    };
    const b = play(false);
    const c = play(true);
    blindPetals += b.petals; evPetals += c.petals;
    if (b.won) blindWins++;
    if (c.won) evWins++;
    changed += c.diff; myMoves += c.myCount;
  }
  console.log(`\n[5] EV player (K=${K} playouts, TOL_EV=${TOL_EV}, charm payouts x${SCALE}${CONTROL ? ', CONTROL: EV ignores charms' : ''}) vs blind, 3 random charms`);
  console.log(`  win rate: blind ${pct(blindWins, GAMES)}  ev ${pct(evWins, GAMES)}`);
  console.log(`  petals/game: blind ${(blindPetals / GAMES).toFixed(2)}  ev ${(evPetals / GAMES).toFixed(2)}  (gain ${pct(evPetals - blindPetals, blindPetals)})`);
  console.log(`  decision-change rate: ${pct(changed, myMoves)}`);
}

// Experiment 6: station ladder calibration. EV player (depth PD) holding 3 random charms plays
// 3-game sets against each rival level; we print quantiles of petals per 3-game set so that
// station targets can be set to a wanted clear rate.
if (process.env.LADDER === '1') {
  const K = 8;
  const TOL_EV = 6;
  const allIds = CHARMS.map((c) => c.id);
  const zero = () => 0;
  const levels: { depth: number; eps: number }[] = [
    { depth: 1, eps: 0.35 }, { depth: 1, eps: 0.15 }, { depth: 2, eps: 0.15 }, { depth: 2, eps: 0.05 }, { depth: 3, eps: 0.05 }, { depth: 4, eps: 0.03 },
  ];
  const SETS = Math.max(40, Math.floor(GAMES / 3));
  console.log(`\n[6] Ladder calibration: EV-${PD} player, 3 random charms, ${SETS} three-game sets per level`);
  console.log(`  level(depth/eps)   win%   petals/game   set quantiles p25 p40 p50 p60 p75`);
  for (const lv of levels) {
    const sets: number[] = [];
    let wins = 0, games = 0, petalsTotal = 0;
    for (let sIdx = 0; sIdx < SETS; sIdx++) {
      const held: CharmId[] = [];
      const pool = allIds.slice();
      const r2 = mulberry32(777 + sIdx);
      while (held.length < 3) held.push(pool.splice(Math.floor(r2() * pool.length), 1)[0]);
      let setPetals = 0;
      let first: Player = ((sIdx & 1) + 1) as Player;
      for (let gi = 0; gi < 3; gi++) {
        const seed = 30000 + sIdx * 10 + gi + lv.depth * 1000;
        const me: Player = 1;
        let g = newGame(seed, first);
        const r = mulberry32(seed);
        while (!g.win) {
          if (g.current === me) {
            const res = chooseMove(g, { depth: PD, rng: zero }, searcher);
            const max = Math.max(...res.scores);
            let idx = res.moves[res.scores.indexOf(max)];
            const cands = max >= WIN - 20 ? res.moves.filter((_, j) => res.scores[j] >= WIN - 20) : res.moves.filter((_, j) => res.scores[j] >= max - TOL_EV);
            if (cands.length > 1) {
              let bestV = -Infinity;
              for (const m of cands) {
                const next = applyMove(g, m);
                let v = 0;
                const pr = mulberry32(seed * 31 + m);
                for (let k = 0; k < K; k++) {
                  let s = next;
                  while (!s.win) s = applyMove(s, chooseMove(s, { depth: 1, blunder: 0.15, rng: pr }, searcher).index);
                  v += scoreGame(s, me, held).total;
                }
                v /= K;
                if (v > bestV) { bestV = v; idx = m; }
              }
            }
            g = applyMove(g, idx);
          } else {
            g = applyMove(g, chooseMove(g, { depth: lv.depth, blunder: lv.eps, rng: r }, searcher).index);
          }
        }
        const sc = scoreGame(g, me, held);
        setPetals += sc.total;
        petalsTotal += sc.total;
        games++;
        if (sc.won) wins++;
        first = g.win!.winner === me ? (2 as Player) : (1 as Player); // loser starts next game
      }
      sets.push(setPetals);
    }
    sets.sort((a, b) => a - b);
    const q = (p: number) => sets[Math.min(sets.length - 1, Math.floor(p * sets.length))];
    console.log(`  d${lv.depth}/e${lv.eps.toFixed(2)}        ${pct(wins, games).padStart(6)}   ${(petalsTotal / games).toFixed(2).padStart(6)}        ${[0.25, 0.4, 0.5, 0.6, 0.75].map((p) => String(q(p)).padStart(3)).join(' ')}`);
  }
}

/**
 * Written by the independent rules-audit agent during the review (docs/reviews/rules-review.md)
 * and kept here so the audit can be re-run: `npx tsx scripts/audit-invariants.ts`.
 * Independent rules audit: plays many games through the engine and checks every
 * state against a reference implementation written from the PDF, not from the engine.
 */
import * as E from '../src/engine/okiya';
import { chooseMove, DIFFICULTY } from '../src/engine/ai';
import { scoreGame, buildContext, CHARMS, BASE_PETALS, type CharmId } from '../src/engine/charms';
import { fireflyHints, worthNow, charmCellClasses } from '../src/game/hints';
import * as R from '../src/game/run';
import { STATIONS } from '../src/game/stations';

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    if (failures < 30) console.error('FAIL:', msg);
  }
}

/* ---------- reference model written from the PDF ---------- */
// Lines: 4 rows, 4 columns, 2 diagonals; squares: every 2x2 block (3x3 = 9 of them).
const REF_LINES: number[][] = [];
for (let r = 0; r < 4; r++) REF_LINES.push([0, 1, 2, 3].map((c) => r * 4 + c));
for (let c = 0; c < 4; c++) REF_LINES.push([0, 1, 2, 3].map((r) => r * 4 + c));
REF_LINES.push([0, 5, 10, 15], [3, 6, 9, 12]);
const REF_SQUARES: number[][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) REF_SQUARES.push([r * 4 + c, r * 4 + c + 1, (r + 1) * 4 + c, (r + 1) * 4 + c + 1]);
const isBorder = (i: number) => { const r = Math.floor(i / 4), c = i % 4; return r === 0 || r === 3 || c === 0 || c === 3; };

function refLegal(board: readonly E.Cell[], last: E.Tile | null): number[] {
  const out: number[] = [];
  board.forEach((cell, i) => {
    if (cell.kind !== 'tile') return;
    if (last === null) { if (isBorder(i)) out.push(i); }
    else if (cell.tile.veg === last.veg || cell.tile.sym === last.sym) out.push(i);
  });
  return out;
}
function refHasFormation(board: readonly E.Cell[], p: E.Player): boolean {
  const mine = (i: number) => board[i].kind === 'token' && (board[i] as { player: E.Player }).player === p;
  return [...REF_LINES, ...REF_SQUARES].some((f) => f.every(mine));
}

/* ---------- 1. exhaustive formation check over all 2^16 token sets ---------- */
check(REF_LINES.length === 10 && REF_SQUARES.length === 9, 'reference formation count');
check(E.FORMATIONS.length === 19, `engine has ${E.FORMATIONS.length} formations, expected 19`);
{
  const engineSets = new Set(E.FORMATIONS.map((f) => [...f.cells].sort((a, b) => a - b).join(',')));
  const refSets = new Set([...REF_LINES, ...REF_SQUARES].map((f) => [...f].sort((a, b) => a - b).join(',')));
  check(engineSets.size === 19 && [...refSets].every((s) => engineSets.has(s)), 'formation sets differ');
  const filler = E.allTiles();
  let mism = 0;
  for (let mask = 0; mask < 1 << 16; mask++) {
    const board: E.Cell[] = filler.map((t, i) => ((mask >> i) & 1 ? { kind: 'token', player: 1 } : { kind: 'tile', tile: t }));
    if ((E.findWin(board, 1) !== null) !== refHasFormation(board, 1)) mism++;
  }
  check(mism === 0, `findWin disagrees with reference on ${mism} of 65536 token sets`);
}
check(JSON.stringify([...E.CENTRE_CELLS].sort()) === JSON.stringify([5, 6, 9, 10].sort()), 'centre cells');
check(E.BORDER_CELLS.length === 12 && E.BORDER_CELLS.every(isBorder), 'border cells');

/* ---------- 2. tile set and shuffle ---------- */
{
  const tiles = E.allTiles();
  const keys = new Set(tiles.map((t) => t.veg + '/' + t.sym));
  check(tiles.length === 16 && keys.size === 16, 'allTiles not 16 distinct');
  // position-0 distribution across seeds ~ uniform
  const counts = new Map<string, number>();
  const N = 160000;
  for (let s = 0; s < N; s++) {
    const g = E.newGame(s);
    const c = g.board[0];
    const k = c.kind === 'tile' ? E.tileCode(c.tile) : '??';
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (s < 2000) {
      const codes = g.board.map((x) => (x.kind === 'tile' ? E.tileCode(x.tile) : '??')).sort().join();
      check(codes === tiles.map(E.tileCode).sort().join(), `seed ${s} not a permutation`);
    }
  }
  const vals = [...counts.values()];
  console.log(`shuffle: cell 0 tile frequency over ${N} seeds: min ${Math.min(...vals)} max ${Math.max(...vals)} (expected ${N / 16}); distinct tiles seen ${counts.size}`);
  check(counts.size === 16 && Math.min(...vals) > N / 16 * 0.95 && Math.max(...vals) < N / 16 * 1.05, 'shuffle not near-uniform at cell 0');
}

/* ---------- deep freeze to catch mutation ---------- */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

/* ---------- 3. random games through the engine ---------- */
type Pick = (g: E.GameState, legal: number[], rng: () => number) => number;
const stats = { games: 0, reasons: {} as Record<string, number>, lengths: {} as Record<number, number>, fullBoard: 0, firstP2: 0, tilesAtEnd: {} as Record<number, number> };

function playGame(seed: number, first: E.Player, pick: Pick, rng: () => number, checkAll = true): E.GameState {
  let g = deepFreeze(E.newGame(seed, first));
  check(g.current === first, 'first player not honoured');
  check(g.lastTile === null && g.history.length === 0 && g.win === null, 'fresh game not clean');
  while (!g.win) {
    const legal = E.legalMoves(g);
    const ref = refLegal(g.board, g.lastTile);
    check(JSON.stringify(legal) === JSON.stringify(ref), `legalMoves ${legal} != reference ${ref}`);
    check(legal.length > 0, 'live game with no legal move (block not detected)');
    if (g.history.length === 0) check(legal.every((i) => ![5, 6, 9, 10].includes(i)), 'centre cell legal on first move');
    if (checkAll) {
      for (let i = 0; i < 16; i++) {
        if (legal.includes(i)) continue;
        let threw = false;
        try { E.applyMove(g, i); } catch { threw = true; }
        check(threw, `applyMove accepted illegal index ${i}`);
      }
    }
    const before = JSON.stringify(g);
    const m = pick(g, legal, rng);
    check(legal.includes(m), `picker chose illegal ${m}`);
    const mover = g.current;
    const next = deepFreeze(E.applyMove(g, m));
    check(JSON.stringify(g) === before, 'applyMove mutated its input');
    // reference outcome
    const formed = refHasFormation(next.board, mover);
    const oppFormed = refHasFormation(next.board, E.opponent(mover));
    check(!oppFormed, 'opponent has a formation after my move (should have ended earlier)');
    const oppLegal = refLegal(next.board, g.board[m].kind === 'tile' ? (g.board[m] as { tile: E.Tile }).tile : null);
    const tilesLeft = next.board.filter((c) => c.kind === 'tile').length;
    const p1 = next.board.filter((c) => c.kind === 'token' && c.player === 1).length;
    const p2 = next.board.filter((c) => c.kind === 'token' && c.player === 2).length;
    check(p1 <= 8 && p2 <= 8, `token count exceeded: ${p1}/${p2}`);
    check(E.tokensInHand(next, 1) === 8 - p1 && E.tokensInHand(next, 2) === 8 - p2, 'tokensInHand mismatch');
    check(next.history.length === g.history.length + 1 && next.history[next.history.length - 1].player === mover, 'history');
    check(next.current === E.opponent(mover), 'turn did not pass');
    if (formed) {
      check(!!next.win && next.win.winner === mover && next.win.reason !== 'blocked', 'formation not reported as win');
      if (next.win) {
        const cellsOk = next.win.cells.length === 4 && next.win.cells.every((i) => next.board[i].kind === 'token' && (next.board[i] as { player: E.Player }).player === mover);
        check(cellsOk, 'win cells are not the mover tokens');
        const isLine = REF_LINES.some((f) => f.join() === next.win!.cells.join());
        check((next.win.reason === 'square') === !isLine, 'reason/cells mismatch');
      }
    } else if (oppLegal.length === 0) {
      check(!!next.win && next.win.winner === mover && next.win.reason === 'blocked' && next.win.cells.length === 0, 'block not reported');
    } else {
      check(next.win === null, `game ended without reason: ${JSON.stringify(next.win)}`);
    }
    if (next.win) {
      check(next.win.tilesRemaining === tilesLeft, 'tilesRemaining wrong');
      check(E.legalMoves(next).length === 0, 'legal moves after the end');
      let threw = false;
      try { E.applyMove(next, oppLegal[0] ?? 0); } catch { threw = true; }
      check(threw, 'applyMove accepted a move after the end');
    }
    g = next;
  }
  stats.games++;
  stats.reasons[g.win.reason] = (stats.reasons[g.win.reason] ?? 0) + 1;
  stats.lengths[g.history.length] = (stats.lengths[g.history.length] ?? 0) + 1;
  stats.tilesAtEnd[g.win.tilesRemaining] = (stats.tilesAtEnd[g.win.tilesRemaining] ?? 0) + 1;
  if (g.win.tilesRemaining === 0) stats.fullBoard++;
  // Alternation and first player.
  g.history.forEach((mv, i) => check(mv.player === (i % 2 === 0 ? first : E.opponent(first)), 'players do not alternate'));
  // Exactly one winner; never a draw.
  check(g.win.winner === 1 || g.win.winner === 2, 'no single winner');
  // Each move in history obeyed the constraint against the previous move's tile.
  g.history.forEach((mv, i) => {
    if (i === 0) check(isBorder(mv.index), 'first move not on border');
    else check(mv.tile.veg === g.history[i - 1].tile.veg || mv.tile.sym === g.history[i - 1].tile.sym, 'history move broke constraint');
  });
  return g;
}

const randomPick: Pick = (_g, legal, rng) => legal[Math.floor(rng() * legal.length)];
const rng = E.mulberry32(2026);
const RANDOM_GAMES = 100000;
for (let i = 0; i < RANDOM_GAMES; i++) playGame(i * 7919 + 13, (i % 2 ? 2 : 1) as E.Player, randomPick, rng, i < 20000);
console.log(`random games: ${stats.games}; reasons ${JSON.stringify(stats.reasons)}; full-garden blocks (0 tiles left) ${stats.fullBoard}`);
console.log(`  game length histogram ${JSON.stringify(stats.lengths)}`);
console.log(`  tiles left at end ${JSON.stringify(stats.tilesAtEnd)}`);

/* ---------- 4. AI only plays legal moves; hints are information-only ---------- */
{
  const before = { ...stats, reasons: { ...stats.reasons } };
  const levels = [...Object.values(DIFFICULTY).filter((o) => !o.timeMs), ...STATIONS.map((s) => s.ai)];
  let aiGames = 0;
  let hintStates = 0;
  const held: CharmId[] = CHARMS.map((c) => c.id);
  for (let i = 0; i < 300; i++) {
    const opts = levels[i % levels.length];
    const r = E.mulberry32(i + 1);
    const pick: Pick = (g, legal) => {
      // Hints on this exact (frozen) state: must not mutate, must only name legal tiles.
      const snap = JSON.stringify(g);
      for (const me of [1, 2] as E.Player[]) {
        const h = fireflyHints(g, me);
        for (const [idx, kind] of h) {
          check(legal.includes(idx), 'lantern hint on an illegal tile');
          const nx = E.applyMove(g, idx);
          const isWin = !!nx.win;
          const rivalWin = !nx.win && E.legalMoves(nx).some((x) => E.applyMove(nx, x).win !== null);
          check((kind === 'win') === isWin && (kind === 'danger') === rivalWin, `lantern hint ${kind} wrong at ${idx}`);
        }
        if (me !== g.current) check(h.size === 0, 'lantern hints on rival turn');
        worthNow(g, me, held);
        const cls = charmCellClasses(g, me, held);
        for (let c = 0; c < 16; c++) check(!/(^|\s)legal(\s|$)/.test(cls(c)), 'charm class injects "legal"');
      }
      check(JSON.stringify(g) === snap, 'hints mutated the game');
      hintStates++;
      const res = chooseMove(g, { ...opts, rng: r });
      check(legal.includes(res.index), `AI chose illegal ${res.index}`);
      check(JSON.stringify(g) === snap, 'AI mutated the game');
      return res.index;
    };
    const g = playGame(50000 + i, (i % 2 ? 2 : 1) as E.Player, pick, r, false);
    aiGames++;
    // Charm scoring reads only; formula uses engine win info.
    const snap = JSON.stringify(g);
    for (const me of [1, 2] as E.Player[]) {
      const s = scoreGame(g, me, held.slice(0, 4));
      check(JSON.stringify(g) === snap, 'scoreGame mutated');
      if (g.win!.winner === me) check(s.total === (BASE_PETALS + g.win!.tilesRemaining + s.add) * (1 + s.mult) && s.tilesRemaining === g.win!.tilesRemaining, 'petal formula');
      else check(s.total === 0, 'loser scored petals');
      const ctx = buildContext(g, me);
      check(ctx.myMoves.length === g.history.filter((m) => m.player === me).length, 'context move count');
    }
  }
  console.log(`AI games: ${aiGames} (levels: ${levels.map((l) => `d${l.depth}/b${l.blunder ?? 0}`).join(', ')}); states with hints checked: ${hintStates}`);
  void before;
}

/* ---------- 5. run state machine: loser starts next, games come from newGame ---------- */
{
  let firstP1 = 0;
  let checkedTransitions = 0;
  const RUNS = 400;
  for (let seed = 1; seed <= RUNS; seed++) {
    let run = R.newRun(seed * 104729);
    if (run.nextFirst === 1) firstP1++;
    run = R.pickCharm(run, run.offers[0]);
    let prevWinner: E.Player | null = null;
    let guard = 0;
    while (run.phase !== 'won' && run.phase !== 'lost' && guard++ < 40) {
      if (run.phase === 'draft') { run = R.skipDraft(run); continue; }
      if (run.phase === 'intro') run = R.startGame(run);
      if (run.phase === 'playing') {
        const g0 = run.game!;
        if (prevWinner !== null) {
          check(g0.current === E.opponent(prevWinner), 'loser did not start the next game');
          checkedTransitions++;
        }
        check(g0.history.length === 0 && g0.win === null && E.legalMoves(g0).every(isBorder), 'game not fresh from newGame');
        // Rebuild the layout from the run seed formula and compare: the game IS newGame(seed, nextFirst).
        const st = R.currentStation(run);
        const r = E.mulberry32(seed);
        let g = g0;
        while (!g.win) {
          const legal = E.legalMoves(g);
          const idx = g.current === R.HUMAN ? legal[Math.floor(r() * legal.length)] : chooseMove(g, { ...st.ai, rng: r }).index;
          check(legal.includes(idx), 'run move illegal');
          g = E.applyMove(g, idx);
        }
        run = { ...run, game: g };
        prevWinner = g.win.winner;
        const fin = R.finishGame(run);
        check(fin.game === run.game, 'finishGame replaced the game');
        check(fin.nextFirst === E.opponent(g.win.winner), 'nextFirst not loser');
        const rec = fin.log[fin.log.length - 1];
        check(rec.reason === g.win.reason && rec.won === (g.win.winner === R.HUMAN) && rec.moves === g.history.length, 'log record does not match engine win');
        run = R.continueRun(fin);
      }
    }
  }
  console.log(`runs: ${RUNS}; first game of run opened by human in ${firstP1}/${RUNS}; loser-starts transitions checked: ${checkedTransitions}`);
}

console.log(failures === 0 ? 'ALL INVARIANTS HELD' : `${failures} FAILURES`);
process.exit(failures ? 1 : 0);

/**
 * An independent model of the rules (the official print-and-play sheet, the designer's ruling for a
 * full garden, and this edition's choice of opener after a tie; docs/RULES.md), written by an
 * auditor who did not write the engine, with its own random numbers and its own formations. It
 * plays many random games and matches through the engine and the match layer and stops at the
 * first disagreement. Output: docs/evidence/rules-oracle.txt.
 *
 *   npx tsx scripts/rules-oracle.ts [games=100000] [matches=20000]
 */
import {
  applyMove,
  legalMoves,
  newGame,
  newGameFromTiles,
  tokensInHand,
  type GameState,
  type MatchMode,
  type Player,
  type Tile,
} from '../src/engine/garden';
import { derive, nextGame, play, restore, startMatch, undo, type MatchView } from '../src/game/match';

const VEG = ['maple', 'cherry', 'pine', 'iris'] as const;
const SYM = ['sun', 'poem', 'bird', 'rain'] as const;

// --- my own PRNG (xorshift32), independent of the engine's mulberry32
function xs(seed: number) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

// --- oracle formations, from coordinates
type Kind = 'row' | 'column' | 'diagonal' | 'square';
const LINES: { kind: Kind; cells: number[] }[] = [];
for (let r = 0; r < 4; r++) LINES.push({ kind: 'row', cells: [0, 1, 2, 3].map((c) => r * 4 + c) });
for (let c = 0; c < 4; c++) LINES.push({ kind: 'column', cells: [0, 1, 2, 3].map((r) => r * 4 + c) });
LINES.push({ kind: 'diagonal', cells: [0, 1, 2, 3].map((k) => k * 4 + k) });
LINES.push({ kind: 'diagonal', cells: [0, 1, 2, 3].map((k) => k * 4 + (3 - k)) });
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) LINES.push({ kind: 'square', cells: [r * 4 + c, r * 4 + c + 1, (r + 1) * 4 + c, (r + 1) * 4 + c + 1] });
if (LINES.length !== 19) throw new Error('oracle lines');

type OCell = { t: [number, number] } | { p: Player };
interface O {
  cells: OCell[];
  toMove: Player;
  last: [number, number] | null;
  over: null | { winner: Player | null; how: 'formation' | 'blocked' | 'tie'; kinds: Kind[]; formations: number[][]; left: number };
}
const onBorder = (i: number) => { const r = Math.floor(i / 4), c = i % 4; return r === 0 || r === 3 || c === 0 || c === 3; };
function oLegal(o: O): number[] {
  if (o.over) return [];
  const out: number[] = [];
  o.cells.forEach((c, i) => {
    if (!('t' in c)) return;
    if (o.last === null) { if (onBorder(i)) out.push(i); }
    else if (c.t[0] === o.last[0] || c.t[1] === o.last[1]) out.push(i);
  });
  return out;
}
function oApply(o: O, i: number): O {
  const c = o.cells[i];
  if (!('t' in c) || !oLegal(o).includes(i)) throw new Error('oracle illegal');
  const cells = o.cells.slice();
  const me = o.toMove;
  cells[i] = { p: me };
  const n: O = { cells, toMove: me === 1 ? 2 : 1, last: c.t, over: null };
  const left = cells.filter((x) => 't' in x).length;
  const held = LINES.filter((L) => L.cells.every((k) => { const x = cells[k]; return 'p' in x && x.p === me; }));
  if (held.length) n.over = { winner: me, how: 'formation', kinds: held.map((h) => h.kind), formations: held.map((h) => h.cells), left };
  else if (left === 0) n.over = { winner: null, how: 'tie', kinds: [], formations: [], left: 0 };
  else if (oLegal(n).length === 0) n.over = { winner: me, how: 'blocked', kinds: [], formations: [], left };
  return n;
}

const tileIdx = (t: Tile): [number, number] => [VEG.indexOf(t.veg as never), SYM.indexOf(t.sym as never)];

function fail(msg: string, ctx: unknown): never {
  console.error('MISMATCH:', msg, JSON.stringify(ctx));
  process.exit(1);
}

// ---------------- Part 1: single games ----------------
const stats: Record<string, number> = {};
const bump = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
const N = Number(process.argv[2] ?? 100000);
const rng = xs(20261013);
const layoutCount = new Map<string, number>();
const posCount: number[][] = Array.from({ length: 16 }, () => Array(16).fill(0));

for (let n = 0; n < N; n++) {
  // Layout: half from the engine's own newGame (to test its shuffle), half from my own shuffle.
  const first: Player = rng() < 0.5 ? 1 : 2;
  let g: GameState;
  if (n % 2 === 0) {
    g = newGame(Math.floor(rng() * 2 ** 32), first);
    // check: a permutation of all 16 official tiles
    const keys = g.board.map((c) => (c.kind === 'tile' ? `${c.tile.veg}/${c.tile.sym}` : 'X'));
    if (new Set(keys).size !== 16 || keys.some((k) => k === 'X' || !VEG.includes(k.split('/')[0] as never) || !SYM.includes(k.split('/')[1] as never))) fail('newGame layout not 16 distinct official tiles', keys);
    if (n < 40000) g.board.forEach((c, i) => { if (c.kind === 'tile') posCount[i][VEG.indexOf(c.tile.veg as never) * 4 + SYM.indexOf(c.tile.sym as never)]++; });
  } else {
    const all: Tile[] = [];
    for (const v of VEG) for (const s of SYM) all.push({ veg: v, sym: s });
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    g = newGameFromTiles(all, first);
  }
  if (g.current !== first) fail('first player not respected', { first });
  let o: O = { cells: g.board.map((c) => (c.kind === 'tile' ? { t: tileIdx(c.tile) } : fail('nontile at start', c))), toMove: first, last: null, over: null };
  let ply = 0;
  // Biased play: sometimes prefer a move that completes a formation or blocks, to visit rare endings.
  const greedy = rng() < 0.3;
  while (true) {
    const eL = legalMoves(g).slice().sort((a, b) => a - b);
    const oL = oLegal(o).slice().sort((a, b) => a - b);
    if (eL.join() !== oL.join()) fail('legal sets differ', { n, ply, eL, oL });
    if (g.current !== o.toMove) fail('turn differs', { n, ply });
    if (o.over) break;
    if (g.result) fail('engine ended early', { n, ply, r: g.result });
    // every non-legal index must throw
    for (let i = 0; i < 16; i++) {
      if (oL.includes(i)) continue;
      let threw = false;
      try { applyMove(g, i); } catch { threw = true; }
      if (!threw) fail('illegal index accepted', { n, ply, i });
    }
    let m = oL[Math.floor(rng() * oL.length)];
    if (greedy) {
      const finishing = oL.filter((i) => oApply(o, i).over);
      if (finishing.length && rng() < 0.7) m = finishing[Math.floor(rng() * finishing.length)];
    }
    const before = g;
    g = applyMove(g, m);
    o = oApply(o, m);
    ply++;
    // immutability of previous state
    if (before.history.length !== ply - 1) fail('previous state mutated', { n, ply });
    if (g.history[ply - 1].index !== m || g.history[ply - 1].player !== (ply % 2 === 1 ? first : (first === 1 ? 2 : 1))) fail('history wrong', { n, ply });
    const lt = g.lastTile!;
    if (tileIdx(lt).join() !== o.last!.join()) fail('lastTile wrong', { n, ply });
    // tokens in hand
    for (const p of [1, 2] as const) {
      const placed = o.cells.filter((c) => 'p' in c && c.p === p).length;
      if (tokensInHand(g, p) !== 8 - placed || placed > 8) fail('tokens in hand', { n, ply, p });
    }
  }
  const r = g.result;
  const ov = o.over!;
  if (!r) fail('engine did not end', { n });
  if (r.winner !== ov.winner) fail('winner differs', { n, r, ov });
  if (r.tilesRemaining !== ov.left) fail('tilesRemaining differs', { n, r, ov });
  if (ov.how === 'tie') { if (r.reason !== 'full' || r.cells.length) fail('tie reason', { n, r }); }
  else if (ov.how === 'blocked') { if (r.reason !== 'blocked' || r.cells.length) fail('blocked reason', { n, r }); }
  else {
    if (!ov.kinds.includes(r.reason as Kind)) fail('formation reason not held', { n, r, ov });
    const sc = [...r.cells].sort((a, b) => a - b).join();
    if (!ov.formations.some((f) => [...f].sort((a, b) => a - b).join() === sc)) fail('formation cells not held', { n, r, ov });
    // the reason must match the cells reported
    const k = ov.formations.findIndex((f) => [...f].sort((a, b) => a - b).join() === sc);
    if (ov.kinds[k] !== r.reason) fail('reason/cells mismatch', { n, r, ov });
    if (ov.kinds.length > 1) bump('multi-formation');
    // would the opponent also have been blocked? (formation takes precedence)
    const blockedToo = ov.left > 0 && oLegal({ ...o, over: null }).length === 0;
    if (blockedToo) bump('formation+block same move');
    if (ov.left === 0) bump('formation on last tile');
  }
  bump(`end:${r.reason}`);
  bump(`winner:${r.winner === null ? 'tie' : r.winner === first ? 'opener' : 'second'}`);
  layoutCount.set('x', 0);
}
// shuffle uniformity (rough): each tile at each position ~ 1/16
let maxDev = 0;
const samples = posCount[0].reduce((a, b) => a + b, 0);
for (const row of posCount) for (const v of row) maxDev = Math.max(maxDev, Math.abs(v / samples - 1 / 16));
console.log(`single games: ${N} checked, layout samples ${samples}, max position/tile freq deviation from 1/16: ${maxDev.toFixed(4)}`);
console.log(stats);

// ---------------- Part 2: matches ----------------
const MODES: MatchMode[] = ['single', 'sets3', 'points10', 'points15', 'points20'];
const target = (m: MatchMode) => (m === 'points10' ? 10 : m === 'points15' ? 15 : m === 'points20' ? 20 : Infinity);
const mstats: Record<string, number> = {};
const mb = (k: string) => (mstats[k] = (mstats[k] ?? 0) + 1);

function randomPlayOut(view: MatchView, r: () => number, tieBias: boolean): MatchView {
  while (!view.game.result) {
    const L = legalMoves(view.game);
    let m = L[Math.floor(r() * L.length)];
    if (tieBias) {
      // prefer moves that do not end the game early, to make full-garden ties common
      const quiet = L.filter((i) => { const nx = applyMove(view.game, i); return !nx.result || nx.result.winner === null; });
      if (quiet.length) m = quiet[Math.floor(r() * quiet.length)];
    }
    view = play(view, m);
  }
  return view;
}

const M = Number(process.argv[3] ?? 20000);
for (let n = 0; n < M; n++) {
  const mode = MODES[n % MODES.length];
  const r = xs(777 + n * 31);
  const setup = { opponent: (n % 2 ? 'human' : 'computer') as 'human' | 'computer', difficulty: 'medium' as const, mode, names: ['A', 'B'] as [string, string] };
  let view = startMatch(setup, r);
  const firstOpener = view.game.current;
  if (view.saved.games[0].first !== firstOpener) fail('opener mismatch at start', {});
  mb(`firstOpener:${firstOpener}`);
  // oracle match state
  let wins = { 1: 0, 2: 0 } as Record<Player, number>;
  let pts = { 1: 0, 2: 0 } as Record<Player, number>;
  let ties = 0;
  let opener: Player = firstOpener;
  let champion: Player | null = null;
  let over = false;
  let games = 0;
  const tieBias = r() < 0.4;
  while (true) {
    if (view.game.current !== opener || view.saved.games[view.saved.games.length - 1].first !== opener) fail('wrong opener for game', { n, games, opener, got: view.game.current });
    view = randomPlayOut(view, r, tieBias);
    const res = view.game.result!;
    games++;
    if (res.winner === null) {
      ties++;
      opener = opener === 1 ? 2 : 1; // edition's choice: the non-opener of the tied game opens next
      if (mode === 'single') over = true;
      mb('tie');
    } else {
      const w = res.winner;
      wins[w]++;
      pts[w] += res.tilesRemaining;
      opener = w === 1 ? 2 : 1; // loser opens
      if (mode === 'single') { over = true; champion = w; }
      else if (mode === 'sets3' && wins[w] >= 3) { over = true; champion = w; }
      else if (mode.startsWith('points') && pts[w] >= target(mode)) { over = true; champion = w; if (pts[w] > target(mode)) mb('overshoot'); }
      if (res.tilesRemaining === 0) mb('zero-point win');
    }
    const ms = view.match;
    if (ms.wins[1] !== wins[1] || ms.wins[2] !== wins[2]) fail('wins', { n, mode, ms, wins });
    if (mode.startsWith('points') && (ms.points[1] !== pts[1] || ms.points[2] !== pts[2])) fail('points', { n, mode, ms, pts });
    if (ms.ties !== ties || ms.gamesPlayed !== games) fail('ties/games', { n, ms, ties, games });
    if (ms.over !== over || ms.champion !== champion) fail('over/champion', { n, mode, ms, over, champion, wins, pts });
    if (!over && ms.nextFirst !== opener) fail('nextFirst', { n, ms, opener });
    // no other player may have reached the target without the match ending
    if (mode === 'sets3' && !over && (wins[1] >= 3 || wins[2] >= 3)) fail('sets3 should be over', { n });
    // Save/restore round trip after every game
    const back = restore(JSON.parse(JSON.stringify(view.saved)));
    if (!back || back.match.over !== ms.over || back.match.champion !== ms.champion || back.match.nextFirst !== ms.nextFirst) fail('restore mismatch', { n });
    if (over) break;
    view = nextGame(view, r);
    if (games > 400) fail('runaway match', { n, mode, wins, pts, ties });
  }
  // nextGame must refuse once the match is over
  let threw = false;
  try { nextGame(view, r); } catch { threw = true; }
  if (!threw) fail('nextGame after match over', { n });
  mb(`${mode}:games=${games > 9 ? '10+' : games}`);
}
console.log(`matches: ${M} checked`);
console.log(mstats);

// ---------------- Part 3: tampered saves must be refused ----------------
{
  const base = startMatch({ opponent: 'human', difficulty: 'easy', mode: 'sets3', names: ['A', 'B'] }, xs(5));
  const g0 = base.saved.games[0];
  const centreFirst = { ...base.saved, games: [{ ...g0, moves: [5] }] };
  if (restore(JSON.parse(JSON.stringify(centreFirst))) !== null) fail('restore accepted a centre opening', {});
  // second game opened by the winner instead of the loser
  const r9 = xs(9);
  let v = randomPlayOut(base, r9, false);
  while (v.game.result!.winner === null) v = randomPlayOut(nextGame(v, r9), r9, false);
  const w = v.game.result!.winner!;
  const bad = { ...v.saved, games: [...v.saved.games, { tiles: g0.tiles, first: w, moves: [] }] };
  if (restore(JSON.parse(JSON.stringify(bad))) !== null) fail('restore accepted the winner opening next', {});
  // a move that shares nothing
  const g = newGameFromTiles(g0.tiles as Tile[], g0.first);
  const m1 = legalMoves(g)[0];
  const g1 = applyMove(g, m1);
  const illegal = [...Array(16).keys()].find((i) => i !== m1 && !legalMoves(g1).includes(i))!;
  const bad2 = { ...base.saved, games: [{ ...g0, moves: [m1, illegal] }] };
  if (restore(JSON.parse(JSON.stringify(bad2))) !== null) fail('restore accepted an unrelated tile', {});
  console.log('tampered saves: refused');
}

// ---------------- Part 4: undo (vs computer) returns to the person's turn ----------------
{
  let checked = 0;
  for (let n = 0; n < 3000; n++) {
    const r = xs(4242 + n);
    let v = startMatch({ opponent: 'computer', difficulty: 'easy', mode: 'single', names: ['You', 'Computer'] }, r);
    const steps = Math.floor(r() * 14);
    for (let s = 0; s < steps && !v.game.result; s++) { const L = legalMoves(v.game); v = play(v, L[Math.floor(r() * L.length)]); }
    if (v.game.result) continue;
    const u = undo(v, 1);
    if (u) {
      if (u.game.current !== 1) fail('undo did not return to the person', { n });
      if (u.game.history.length >= v.game.history.length) fail('undo took nothing back', { n });
      // derive consistency
      const d = derive(u.saved);
      if (d.game.history.length !== u.game.history.length) fail('undo derive', { n });
      checked++;
    }
  }
  console.log(`undo checks: ${checked}`);
}

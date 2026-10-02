/**
 * Hanamichi — The Flower Road. Single-page app, framework-free.
 * Every Okiya game is played through the engine; this file only renders and sequences.
 */
import { chooseMove } from '../engine/ai';
import { CHARM_BY_ID, type CharmId } from '../engine/charms';
import { applyMove, legalMoves, mulberry32, type GameState, type Tile } from '../engine/okiya';
import { charmCellClasses, fireflyHints, worthNow, type FireflyHint } from '../game/hints';
import {
  HUMAN,
  continueRun,
  currentStation,
  finishGame,
  lanternsLeft,
  newRun,
  pickCharm,
  skipDraft,
  startGame,
  stationCleared,
  useFirefly,
  validateRun,
  type RunState,
} from '../game/run';
import { MAX_HELD, STATIONS } from '../game/stations';
import { renderBoard } from './board';
import { charmGlyph } from './charmArt';
import { escapeHtml } from './dom';
import { okiyaRulesHtml } from './rulesPanel';
import { dailySeed, loadJson, saveJson } from './storage';
import { SYM_LABEL, VEG_LABEL, gardenKeyHtml, petalIcon, symGlyph, tileLabel, tileSvg, vegGlyph } from './tileArt';

interface Meta {
  runsStarted: number;
  runsWon: number;
  bestStation: number; // 1-based station reached (0 = none)
  bestPetals: number;
  discovered: CharmId[];
}

const RUN_KEY = 'hanamichi.run.v1';
const META_KEY = 'hanamichi.meta.v1';

/** Coerce whatever is in storage into a well-formed Meta; anything odd falls back to zero. */
function sanitizeMeta(raw: unknown): Meta {
  const m = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const count = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 1e9 ? x : 0);
  const ids = new Set<string>(Object.keys(CHARM_BY_ID));
  const discovered = Array.isArray(m.discovered) ? (m.discovered.filter((id): id is CharmId => typeof id === 'string' && ids.has(id)) as CharmId[]) : [];
  return {
    runsStarted: count(m.runsStarted),
    runsWon: count(m.runsWon),
    bestStation: Math.min(count(m.bestStation), STATIONS.length),
    bestPetals: count(m.bestPetals),
    discovered: [...new Set(discovered)],
  };
}

type View = 'title' | 'run';

interface UiState {
  view: View;
  run: RunState | null;
  meta: Meta;
  showRules: boolean;
  showCharm: CharmId | null;
  fireflyLit: boolean;
  lastIndex: number | null;
  aiThinking: boolean;
  releasing: CharmId | null; // when the hand is full: the offered charm chosen, awaiting a release
}

const petal = () => `<span class="petal-mark">${petalIcon()}</span>`;

export class App {
  private s: UiState;
  private root: HTMLElement;
  private aiTimer: number | null = null;
  private gameRng: () => number = mulberry32(1);

  constructor(root: HTMLElement) {
    this.root = root;
    const run = validateRun(loadJson<unknown>(RUN_KEY, null));
    this.s = {
      view: 'title',
      run: run && run.phase !== 'won' && run.phase !== 'lost' ? run : null,
      meta: sanitizeMeta(loadJson<unknown>(META_KEY, null)),
      showRules: false,
      showCharm: null,
      fireflyLit: false,
      lastIndex: null,
      aiThinking: false,
      releasing: null,
    };
    this.root.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.s.showRules = false;
        this.s.showCharm = null;
        this.render();
      }
    });
  }

  /* ---------------- state helpers ---------------- */

  private setRun(run: RunState | null): void {
    this.s.run = run;
    saveJson(RUN_KEY, run);
    if (run) {
      const reached = run.station + 1;
      const meta = this.s.meta;
      let changed = false;
      if (reached > meta.bestStation) { meta.bestStation = reached; changed = true; }
      if (run.totalPetals > meta.bestPetals) { meta.bestPetals = run.totalPetals; changed = true; }
      for (const id of run.held) if (!meta.discovered.includes(id)) { meta.discovered.push(id); changed = true; }
      if (changed) saveJson(META_KEY, meta);
    }
  }

  private beginRun(seed: number): void {
    this.s.meta.runsStarted++;
    saveJson(META_KEY, this.s.meta);
    this.s.view = 'run';
    this.s.releasing = null;
    this.s.fireflyLit = false;
    this.s.lastIndex = null;
    this.setRun(newRun(seed));
    this.render();
  }

  private resumeRun(): void {
    this.s.view = 'run';
    const run = this.s.run;
    // A game that ended just before the tab was closed: tally it now instead of stranding it.
    if (run && run.phase === 'playing' && run.game?.win) this.setRun(finishGame(run));
    this.render();
    this.maybeScheduleAi();
  }

  private gameRngFor(run: RunState): () => number {
    return mulberry32((run.seed + run.station * 1000 + run.gamesPlayed * 7 + 1) >>> 0 ^ 0xabcdef);
  }

  private enterGame(next: RunState): void {
    this.gameRng = this.gameRngFor(next);
    this.s.fireflyLit = false;
    this.s.lastIndex = null;
    this.setRun(next);
    this.render();
    this.maybeScheduleAi();
  }

  private humanMove(index: number): void {
    const run = this.s.run;
    if (!run || run.phase !== 'playing' || !run.game || run.game.current !== HUMAN || this.s.aiThinking) return;
    if (!legalMoves(run.game).includes(index)) return;
    const game = applyMove(run.game, index);
    this.s.lastIndex = index;
    this.s.fireflyLit = false;
    this.setRun({ ...run, game });
    this.render();
    this.afterMove();
  }

  private afterMove(): void {
    const run = this.s.run;
    if (!run || !run.game) return;
    if (run.game.win) {
      // Let the player see the final formation, then tally.
      window.setTimeout(() => {
        const r = this.s.run;
        if (!r || r.phase !== 'playing' || !r.game?.win) return;
        this.setRun(finishGame(r));
        this.render();
      }, 1100);
      return;
    }
    this.maybeScheduleAi();
  }

  private maybeScheduleAi(): void {
    const run = this.s.run;
    if (!run || run.phase !== 'playing' || !run.game || run.game.win || run.game.current === HUMAN) return;
    if (this.aiTimer !== null) return;
    this.s.aiThinking = true;
    this.render();
    const st = currentStation(run);
    this.aiTimer = window.setTimeout(() => {
      this.aiTimer = null;
      const r = this.s.run;
      if (!r || r.phase !== 'playing' || !r.game || r.game.win || r.game.current === HUMAN) {
        this.s.aiThinking = false;
        return;
      }
      if (r.game.history.length === 0) this.gameRng = this.gameRngFor(r);
      const res = chooseMove(r.game, { ...st.ai, rng: this.gameRng });
      const game = applyMove(r.game, res.index);
      this.s.lastIndex = res.index;
      this.s.aiThinking = false;
      this.setRun({ ...r, game });
      this.render();
      this.afterMove();
    }, 650);
  }

  /* ---------------- events ---------------- */

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t) return;
    const action = t.dataset.action!;
    const run = this.s.run;
    switch (action) {
      case 'new-run':
        this.beginRun((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
        break;
      case 'daily-run':
        this.beginRun(dailySeed());
        break;
      case 'resume':
        this.resumeRun();
        break;
      case 'title':
        if (run && run.phase === 'playing' && this.s.view === 'run' && !window.confirm('Leave the garden? Your road is saved and you can continue later.')) return;
        this.s.view = 'title';
        this.render();
        break;
      case 'rules':
        this.s.showRules = !this.s.showRules;
        this.render();
        break;
      case 'close':
        this.s.showRules = false;
        this.s.showCharm = null;
        this.render();
        break;
      case 'charm-info':
        this.s.showCharm = (t.dataset.charm as CharmId) ?? null;
        this.render();
        break;
      case 'pick': {
        if (!run) return;
        const id = t.dataset.charm as CharmId;
        if (run.held.length >= MAX_HELD) {
          this.s.releasing = id;
          this.render();
          return;
        }
        this.setRun(pickCharm(run, id));
        this.render();
        break;
      }
      case 'release': {
        if (!run || !this.s.releasing) return;
        const drop = t.dataset.charm as CharmId;
        this.setRun(pickCharm(run, this.s.releasing, drop));
        this.s.releasing = null;
        this.render();
        break;
      }
      case 'cancel-release':
        this.s.releasing = null;
        this.render();
        break;
      case 'skip-draft':
        if (!run) return;
        this.setRun(skipDraft(run));
        this.render();
        break;
      case 'start-game':
        if (!run) return;
        this.enterGame(startGame(run));
        break;
      case 'firefly':
        if (!run || run.fireflyUsed || run.phase !== 'playing' || run.game?.current !== HUMAN) return;
        this.setRun(useFirefly(run));
        this.s.fireflyLit = true;
        this.render();
        break;
      case 'continue': {
        if (!run || run.phase !== 'result') return;
        const next = continueRun(run);
        if (next.phase === 'playing') {
          this.enterGame(next);
        } else {
          if (next.phase === 'won') {
            this.s.meta.runsWon++;
            saveJson(META_KEY, this.s.meta);
          }
          this.setRun(next);
          this.render();
        }
        break;
      }
      default:
        break;
    }
  }

  /* ---------------- rendering ---------------- */

  render(): void {
    const { view, run } = this.s;
    let html = '';
    if (view === 'title' || !run) html = this.renderTitle();
    else html = this.renderRun(run);
    html += this.renderOverlays();
    this.root.innerHTML = html;
    if (view === 'run' && run?.game) this.mountBoard(run);
    this.animateCounter();
    this.keepBoardVisible(run);
  }

  /** When a result appears on a small screen, scroll so the board's bottom edge sits above it. */
  private keepBoardVisible(run: RunState | null): void {
    if (!run || run.phase !== 'result' || this.s.view !== 'run') return;
    const board = this.root.querySelector<HTMLElement>('.board-wrap');
    if (!board) return;
    const wide = window.innerWidth >= 900;
    if (wide) return;
    const sheet = this.root.querySelector<HTMLElement>('.result-backdrop .sheet.result');
    const inline = this.root.querySelector<HTMLElement>('.result-tablet');
    requestAnimationFrame(() => {
      const r = board.getBoundingClientRect();
      if (sheet && getComputedStyle(sheet).display !== 'none' && window.innerWidth < 600) {
        const sheetH = sheet.getBoundingClientRect().height;
        const target = window.scrollY + r.bottom - (window.innerHeight - sheetH) + 8;
        window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      } else if (inline) {
        const top = window.scrollY + r.top - 72;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    });
  }

  private renderTitle(): string {
    const { meta, run } = this.s;
    const resumable = run && run.phase !== 'won' && run.phase !== 'lost';
    const played = meta.runsStarted > 0;
    return `
    <main class="screen title-screen">
      <header class="title-hero">
        <p class="eyebrow">A journey of Okiya</p>
        <h1 class="title-word">Hanamichi</h1>
        <p class="subtitle">The Flower Road</p>
        <p class="lede">Six gardens, six rivals, three lanterns at each gate. Win real games of Okiya, and win them <em>beautifully</em>: your charms decide which victories bloom.</p>
      </header>
      <div class="title-actions">
        ${resumable ? `<button class="btn btn-primary" data-action="resume">Continue the road <span class="btn-sub">${escapeHtml(currentStation(run).place)} · station ${run.station + 1}</span></button>` : ''}
        <button class="btn ${resumable ? '' : 'btn-primary'}" data-action="new-run">${resumable ? 'Start a new road' : 'Begin the road'}</button>
        <button class="btn" data-action="daily-run">Today's road <span class="btn-sub">same gardens for everyone today</span></button>
        <button class="btn btn-ghost" data-action="rules">How to play</button>
      </div>
      ${played ? `<section class="record">
        <div><span class="num">${meta.runsWon}</span><span class="lbl">roads completed</span></div>
        <div><span class="num">${meta.bestStation}/${STATIONS.length}</span><span class="lbl">furthest station</span></div>
        <div><span class="num">${meta.bestPetals}</span><span class="lbl">most petals</span></div>
      </section>` : '<section class="record"></section>'}
      <footer class="credits">Built on <strong>Okiya</strong> by Bruno Cathala &amp; Cyril Bouquet (Blue Orange Games). The official rules are played unchanged in every game.</footer>
    </main>`;
  }

  private renderRun(run: RunState): string {
    switch (run.phase) {
      case 'start-draft':
      case 'draft':
        return this.renderDraft(run);
      case 'intro':
        return this.renderIntro(run);
      case 'playing':
      case 'result':
        return this.renderPlay(run);
      case 'won':
      case 'lost':
        return this.renderEnd(run);
    }
  }

  private charmCard(id: CharmId, action: string, extra = '', cta = ''): string {
    const c = CHARM_BY_ID[id];
    return `<button type="button" class="charm-card ${extra}" data-action="${action}" data-charm="${id}">
      <span class="charm-icon">${charmGlyph(c)}</span>
      <span class="charm-name">${escapeHtml(c.name)}</span>
      <span class="charm-rule">${escapeHtml(c.rule)}</span>
      ${cta ? `<span class="charm-cta">${cta} <span aria-hidden="true">›</span></span>` : ''}
    </button>`;
  }

  private renderDraft(run: RunState): string {
    const st = currentStation(run);
    const first = run.phase === 'start-draft';
    const full = run.held.length >= MAX_HELD;
    const releasing = this.s.releasing;
    return `
    <main class="screen draft-screen">
      ${this.topBar(run, first ? 'Before the road' : `On the way to ${st.place}`)}
      <section class="panel draft-panel">
        <p class="eyebrow">${first ? 'Before the road' : `Station ${st.index + 1} · ${escapeHtml(st.place)}`}</p>
        <h2>${first ? 'Choose your first charm' : 'A charm for the road ahead'}</h2>
        <p class="muted">Charms never change how Okiya is played. They decide how many petals a <em>win</em> is worth.</p>
        ${releasing ? `<p class="notice">Your hand is full. Release one charm below to take <strong>${escapeHtml(CHARM_BY_ID[releasing].name)}</strong>, or <button class="link" data-action="cancel-release">keep your hand</button>.</p>` : ''}
        <div class="charm-grid">
          ${run.offers.map((id) => this.charmCard(id, 'pick', releasing === id ? 'selected' : releasing ? 'dimmed' : '', releasing ? '' : 'Take this charm')).join('')}
        </div>
        ${run.held.length ? `<h3 class="held-title">Your hand ${full ? '(full)' : `(${run.held.length}/${MAX_HELD})`}</h3>
        <div class="charm-grid small">${run.held.map((id) => this.charmCard(id, releasing ? 'release' : 'charm-info', releasing ? 'release-target' : '', releasing ? 'Release' : '')).join('')}</div>` : ''}
        ${!first ? `<div class="row-actions"><button class="btn btn-ghost" data-action="skip-draft">Walk on without a new charm</button></div>` : ''}
      </section>
    </main>`;
  }

  private topBar(run: RunState, context: string): string {
    return `<header class="topbar">
      <button class="link brand" data-action="title">Hanamichi</button>
      <span class="context">${escapeHtml(context)}</span>
      <span class="spacer"></span>
      <span class="petal-total" title="Petals gathered on this road">${run.totalPetals} ${petal()}</span>
      <button class="icon-btn" data-action="rules" aria-label="How to play">?</button>
    </header>`;
  }

  private road(run: RunState): string {
    return `<ol class="road" aria-label="The Flower Road">
      ${STATIONS.map((s) => {
        const state = s.index < run.station ? 'done' : s.index === run.station ? 'here' : 'ahead';
        return `<li class="road-stop ${state} season-${s.season.toLowerCase()}">
          <span class="road-dot"></span>
          <span class="road-text"><span class="road-place">${escapeHtml(s.place)}</span><span class="road-rival">${escapeHtml(s.rival.name)}</span></span>
        </li>`;
      }).join('')}
    </ol>`;
  }

  private roadColumn(run: RunState): string {
    const st = currentStation(run);
    return `<aside class="road-col"><p class="eyebrow">${escapeHtml(st.season)} · station ${st.index + 1} of ${STATIONS.length}</p>${this.road(run)}</aside>`;
  }

  private renderIntro(run: RunState): string {
    const st = currentStation(run);
    return `
    <main class="screen intro-screen">
      ${this.topBar(run, `${st.season} · station ${st.index + 1} of ${STATIONS.length}`)}
      ${this.roadColumn(run)}
      <section class="panel intro season-${st.season.toLowerCase()}">
        <p class="eyebrow">${escapeHtml(st.season)}</p>
        <h2 class="place">${escapeHtml(st.place)}</h2>
        <div class="rival-card">
          <div class="rival-crest" aria-hidden="true"><span></span></div>
          <div>
            <h3>${escapeHtml(st.rival.name)}, <span class="rival-title">${escapeHtml(st.rival.title)}</span></h3>
            <p class="rival-line">${escapeHtml(st.rival.line)}</p>
          </div>
        </div>
        <dl class="station-facts">
          <div><dt>Target</dt><dd>${st.target} ${petal()}</dd></div>
          <div><dt>Lanterns</dt><dd>${st.lanterns} games</dd></div>
          <div><dt>First move</dt><dd>${run.nextFirst === HUMAN ? 'You' : escapeHtml(st.rival.name)}</dd></div>
          <div class="facts-charms"><dt>Charms</dt><dd>${run.held.length ? run.held.map((id) => this.charmChip(id)).join('') : '<span class="muted">none</span>'}</dd></div>
        </dl>
        <p class="muted">Gather ${st.target} petals across the three lanterns to walk on. ${run.nextFirst === HUMAN ? 'You open the garden.' : `${escapeHtml(st.rival.name)} opens; the loser of each game starts the next.`}</p>
        <div class="row-actions start">
          <button class="btn btn-primary" data-action="start-game">Light the first lantern</button>
        </div>
      </section>
      <aside class="side intro-side"></aside>
    </main>`;
  }

  private charmChip(id: CharmId, state = ''): string {
    const c = CHARM_BY_ID[id];
    return `<button type="button" class="charm-chip ${state}" data-action="charm-info" data-charm="${id}" title="${escapeHtml(c.rule)}">
      ${charmGlyph(c)}<span>${escapeHtml(c.name)}</span></button>`;
  }

  private constraintHtml(game: GameState, rivalName: string): string {
    if (!game.lastTile) {
      return `<div class="constraint first">
        <span class="constraint-body">
        <span class="constraint-label">${game.current === HUMAN ? 'Your opening' : `${escapeHtml(rivalName)} opens`}</span>
        <span class="constraint-text">Any tile on the <strong>outer border</strong>. The four centre tiles are closed on move one.</span>
        </span>
      </div>`;
    }
    const t: Tile = game.lastTile;
    const who = game.current === HUMAN ? `${escapeHtml(rivalName)} took` : 'You took';
    return `<div class="constraint">
      <span class="constraint-tile">${tileSvg(t)}</span>
      <span class="constraint-body">
        <span class="constraint-label">${who} <em>${escapeHtml(tileLabel(t))}</em></span>
        <span class="constraint-text">${game.current === HUMAN ? 'Play' : `${escapeHtml(rivalName)} must play`} ${vegGlyph(t.veg)} <strong>${VEG_LABEL[t.veg].toLowerCase()}</strong> or ${symGlyph(t.sym)} <strong>${SYM_LABEL[t.sym].toLowerCase()}</strong></span>
      </span>
    </div>`;
  }

  private fireflyButton(run: RunState, yourTurn: boolean, note: string, extraClass: string): string {
    const lit = this.s.fireflyLit && yourTurn;
    const spent = run.fireflyUsed && !lit;
    const state = lit ? 'lit' : spent ? 'spent' : 'idle';
    const title = lit ? 'Firefly shining for this move' : spent ? 'Firefly used at this station' : 'Wake the Firefly';
    const sub = lit ? note : spent ? 'One per station. It wakes again at the next gate.' : 'Once per station: marks the tiles that win now and the tiles that hand the rival a win.';
    return `<button class="btn firefly-btn ${state} ${extraClass}" data-action="firefly" ${spent || !yourTurn ? 'disabled' : ''} aria-pressed="${lit}">
      <span class="firefly-icon" aria-hidden="true"></span>
      <span class="firefly-text">
        <span class="firefly-title">${title}</span>
        <span class="firefly-sub">${sub}</span>
      </span>
    </button>`;
  }

  private conditionalText(id: CharmId): string {
    switch (id) {
      case 'stone-lantern': return '+6 on a square';
      case 'bamboo-fence': return '+4 on a row or column';
      case 'crane-scroll': return '+8 on a diagonal';
      case 'thorn-hedge': return '+4 on a block';
      case 'swift-blossom': return '×2 with 6 tokens or fewer';
      default: return CHARM_BY_ID[id].name;
    }
  }

  private statusHtml(run: RunState, game: GameState): string {
    const st = currentStation(run);
    const rival = escapeHtml(st.rival.name);
    if (game.win) {
      if (game.win.fullGarden) {
        return game.win.winner === HUMAN ? `You win: the garden is empty and ${rival} has no tile to take.` : `${rival} wins: the garden is empty and you have no tile to take.`;
      }
      const how = game.win.reason === 'blocked' ? 'blocking' : `a ${game.win.reason}`;
      return game.win.winner === HUMAN ? `You win by ${how}!` : `${rival} wins by ${game.win.reason === 'blocked' ? 'blocking you' : how}.`;
    }
    if (game.current !== HUMAN || run.phase !== 'playing') return `${rival} is thinking…`;
    if (!game.lastTile) return `<strong>Your move:</strong> take any tile on the outer border`;
    const t = game.lastTile;
    return `<strong>Your move:</strong> take a ${vegGlyph(t.veg)} <b>${VEG_LABEL[t.veg].toLowerCase()}</b> or ${symGlyph(t.sym)} <b>${SYM_LABEL[t.sym].toLowerCase()}</b> tile`;
  }

  private renderPlay(run: RunState): string {
    const st = currentStation(run);
    const game = run.game!;
    const target = st.target;
    const pct = Math.min(100, Math.round((100 * run.stationPetals) / target));
    const pips = Array.from({ length: st.lanterns }, (_, i) => {
      const lit = i < run.gamesPlayed || (i === run.gamesPlayed && run.phase === 'playing');
      const burning = i === run.gamesPlayed && run.phase === 'playing';
      return `<span class="lantern ${lit ? 'lit' : ''} ${burning ? 'burning' : ''}" aria-hidden="true"></span>`;
    }).join('');
    const yourTurn = game.current === HUMAN && !game.win && run.phase === 'playing';
    const over = !!game.win;
    const worth = worthNow(game, HUMAN, run.held);
    const myTokens = game.history.filter((m) => m.player === HUMAN).length;
    const rivalTokens = game.history.length - myTokens;
    const hints = this.s.fireflyLit && yourTurn ? fireflyHints(game, HUMAN) : new Map<number, FireflyHint>();
    const wins = [...hints.values()].filter((h) => h === 'win').length;
    const dangers = [...hints.values()].filter((h) => h === 'danger').length;
    const fireflyNote = this.s.fireflyLit && yourTurn
      ? wins || dangers
        ? `${wins ? `${wins} tile${wins > 1 ? 's' : ''} win${wins > 1 ? '' : 's'} now` : ''}${wins && dangers ? ' · ' : ''}${dangers ? `${dangers} tile${dangers > 1 ? 's' : ''} hand${dangers > 1 ? '' : 's'} ${escapeHtml(st.rival.name)} a win` : ''}`
        : `No tile wins now, and none hands ${escapeHtml(st.rival.name)} a win.`
      : '';
    const worthLine = `${worth.base} base + ${worth.tiles} tile${worth.tiles === 1 ? '' : 's'} left${worth.adds.map((a) => ` + ${a.add} ${escapeHtml(CHARM_BY_ID[a.id].name)}`).join('')}${worth.conditional.map((id) => ` · ${this.conditionalText(id)} (${escapeHtml(CHARM_BY_ID[id].name)})`).join('')}`;
    const fireflyBtn = (cls: string) => this.fireflyButton(run, yourTurn, fireflyNote, cls);
    return `
    <main class="screen play-screen season-${st.season.toLowerCase()} ${over ? 'game-over' : ''}">
      ${this.topBar(run, `${st.place} · ${st.rival.name} ${st.rival.title}`)}
      ${this.roadColumn(run)}
      <section class="centre">
        <section class="hud">
          <div class="hud-row">
            <div class="lanterns" aria-label="Game ${Math.min(run.gamesPlayed + 1, st.lanterns)} of ${st.lanterns}">${pips}<span class="lantern-label">Game ${Math.min(run.gamesPlayed + (run.phase === 'playing' ? 1 : 0), st.lanterns)} of ${st.lanterns}</span></div>
            <div class="target">
              <div class="target-text"><strong>${run.stationPetals}</strong> / ${target} ${petal()}</div>
              <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${run.stationPetals}"><span style="width:${pct}%"></span></div>
            </div>
          </div>
          <p class="status ${yourTurn ? 'your-turn' : ''} ${over ? 'finished' : ''}" aria-live="polite">${this.statusHtml(run, game)}</p>
        </section>
        <div class="players">
          <div class="player me ${yourTurn ? 'active' : ''}"><span class="token-mini p1"></span>You <small>${8 - myTokens} token${8 - myTokens === 1 ? '' : 's'}</small></div>
          <div class="player rival ${!yourTurn && !over ? 'active' : ''}"><small>${8 - rivalTokens} token${8 - rivalTokens === 1 ? '' : 's'}</small>${escapeHtml(st.rival.name)}<span class="token-mini p2"></span></div>
        </div>
        <div class="board-wrap"><div id="board" class="board"></div>${this.winStroke(game)}</div>
        ${over ? '' : this.constraintHtml(game, st.rival.name)}
        ${over ? '' : fireflyBtn('firefly-mobile')}
        <p class="goal-line">Win: 4 in a line · a 2×2 square · leave ${escapeHtml(st.rival.name)} no tile</p>
        ${run.phase === 'result' && run.lastResult ? `<div class="result-inline result-tablet">${this.resultPanel(run)}</div>` : ''}
      </section>
      <aside class="side tray">
        ${over ? '' : `<div class="worth">
          <span class="worth-label">${worth.exact ? 'A winning tile is open, worth' : 'A win on your next move is worth'}</span>
          <span class="worth-num">${worth.total} ${petal()}</span>
          <span class="worth-detail">${worthLine}</span>
        </div>`}
        <div class="hand">
          <h3>Charms</h3>
          <div class="hand-strip">${run.held.length ? run.held.map((id) => this.charmChip(id)).join('') : '<span class="muted">none yet</span>'}</div>
        </div>
        ${run.phase === 'result' && run.lastResult ? `<div class="result-inline result-desktop">${this.resultPanel(run)}</div>` : ''}
        ${over ? '' : fireflyBtn('firefly-desktop')}
      </aside>
      ${run.phase === 'result' && run.lastResult ? this.renderResult(run) : ''}
    </main>`;
  }

  /** A brush stroke through the four winning cells, drawn over the board. */
  private winStroke(game: GameState): string {
    const cells = game.win?.cells ?? [];
    if (cells.length !== 4) return '';
    const pt = (i: number) => ({ x: ((i % 4) + 0.5) * 25, y: (Math.floor(i / 4) + 0.5) * 25 });
    const a = pt(cells[0]);
    const b = pt(cells[3]);
    const isSquare = game.win?.reason === 'square';
    const d = isSquare
      ? (() => {
          const c = cells.map(pt);
          const cx = (c[0].x + c[3].x) / 2;
          const cy = (c[0].y + c[3].y) / 2;
          return `M${cx - 14},${cy} a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0`;
        })()
      : `M${a.x},${a.y} L${b.x},${b.y}`;
    return `<svg class="win-stroke" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  private renderResult(run: RunState): string {
    return `<div class="sheet-backdrop result-backdrop">${this.resultPanel(run)}</div>`;
  }

  private resultPanel(run: RunState): string {
    const st = currentStation(run);
    const r = run.lastResult!;
    const cleared = stationCleared(run);
    const left = lanternsLeft(run);
    const last = run.log[run.log.length - 1];
    const rows: string[] = [];
    if (r.won) {
      rows.push(`<li><span>Victory by ${run.game?.win?.fullGarden ? 'emptying the garden' : last.reason === 'blocked' ? 'blocking' : `a ${escapeHtml(last.reason)}`}</span><span>+${r.base}</span></li>`);
      rows.push(`<li><span>${r.tilesRemaining} tile${r.tilesRemaining === 1 ? '' : 's'} left in the garden</span><span>+${r.tilesRemaining}</span></li>`);
      for (const e of r.effects) {
        // Saved tallies carry a copy of the charm; render from the catalogue by id.
        const charm = CHARM_BY_ID[e.charm.id] ?? e.charm;
        const add = Number(e.effect.add) || 0;
        const mult = Number(e.effect.mult) || 0;
        const fired = add || mult;
        rows.push(`<li class="${fired ? 'fired' : 'quiet'}"><span>${charmGlyph(charm)} ${escapeHtml(String(charm.name))}${fired ? ` <small>${escapeHtml(String(e.effect.note))}</small>` : ' <small>did not bloom</small>'}</span><span>${mult ? `×${1 + mult}` : add ? `+${add}` : '—'}</span></li>`);
      }
    } else {
      const how = run.game?.win?.fullGarden ? 'an empty garden: you had no tile left to take' : last.reason === 'blocked' ? 'blocking you' : `a ${escapeHtml(last.reason)}`;
      rows.push(`<li><span>${escapeHtml(st.rival.name)} wins by ${how} · ${last.moves} moves</span><span>0</span></li>`);
    }
    const toGo = st.target - run.stationPetals;
    let cta: string;
    let math = '';
    if (cleared) cta = run.station >= STATIONS.length - 1 ? 'Reach the end of the road' : 'Walk on to the next station';
    else if (left > 0) {
      cta = `Light the next lantern`;
      math = `${run.stationPetals} / ${st.target} · ${left} game${left > 1 ? 's' : ''} left · need about ${Math.ceil(toGo / left)} a win`;
    } else cta = 'The road ends here';
    return `<section class="sheet result ${r.won ? 'won' : 'lost'}" role="dialog" aria-label="Game result">
        <p class="eyebrow">${cleared ? 'Station cleared' : left > 0 ? `Game ${run.gamesPlayed} of ${st.lanterns}` : 'All three games played'}</p>
        <h2>${r.won ? 'The garden blooms' : 'The garden fades'}</h2>
        <ul class="tally">${rows.join('')}</ul>
        <p class="tally-total"><span>Petals this game</span><span class="count-up" data-count="${Number(r.total) || 0}">${Number(r.total) || 0}</span></p>
        <p class="tally-station">${math ? escapeHtml(math) : `Station: <strong>${run.stationPetals}</strong> / ${st.target}`} ${math ? '' : petal()}</p>
        <button class="btn btn-primary" data-action="continue">${cta}</button>
      </section>`;
  }

  private renderEnd(run: RunState): string {
    const won = run.phase === 'won';
    const st = currentStation(run);
    const wins = run.log.filter((l) => l.won).length;
    return `
    <main class="screen end-screen">
      ${this.topBar(run, won ? 'The end of the road' : 'The road ends')}
      <section class="panel end ${won ? 'won' : 'lost'}">
        <p class="eyebrow">${won ? 'Winter · Snow Pavilion' : `${escapeHtml(st.season)} · ${escapeHtml(st.place)}`}</p>
        <h2>${won ? 'You walked the whole Flower Road' : `${escapeHtml(st.rival.name)} closes the gate`}</h2>
        <p class="lede">${won ? 'Every garden bloomed. Okasan bows.' : `${run.stationPetals} of ${st.target} petals gathered at station ${run.station + 1}.`}</p>
        <dl class="station-facts">
          <div><dt>Petals</dt><dd>${run.totalPetals} ${petal()}</dd></div>
          <div><dt>Games won</dt><dd>${wins} / ${run.log.length}</dd></div>
          <div><dt>Stations</dt><dd>${won ? STATIONS.length : run.station} / ${STATIONS.length}</dd></div>
        </dl>
        <ol class="log">${run.log.map((l) => `<li class="${l.won ? 'won' : 'lost'}"><span>${escapeHtml(STATIONS[l.station].place)} · lantern ${l.game + 1}</span><span>${l.won ? `won by ${l.reason}` : `lost (${l.reason})`} · ${l.moves} moves</span><span>${l.petals} ${petal()}</span></li>`).join('')}</ol>
        <div class="row-actions">
          <button class="btn btn-primary" data-action="new-run">Walk again</button>
          <button class="btn btn-ghost" data-action="title">Back to the gate</button>
        </div>
      </section>
    </main>`;
  }

  private renderOverlays(): string {
    let html = '';
    if (this.s.showRules) {
      html += `<div class="sheet-backdrop" data-action="close"><section class="sheet rules" role="dialog" aria-label="How to play" onclick="event.stopPropagation()">
        <button class="icon-btn close" data-action="close" aria-label="Close">×</button>
        <h2>How to play</h2>
        <h3 class="rule-part">Okiya, the game at the core</h3>
        ${okiyaRulesHtml()}
        <h4 class="rule-sub">The sixteen tiles</h4>
        ${gardenKeyHtml()}
        <h3 class="rule-part">The Flower Road</h3>
        <h4 class="rule-sub">Stations and lanterns</h4>
        <p>Walk six stations. At each one you have <strong>three lanterns</strong>: three full games of Okiya against the station's rival. Gather the station's <strong>petal target</strong> before the lanterns run out and you walk on, drafting a new charm. Miss it and the road ends.</p>
        <h4 class="rule-sub">Petals and charms</h4>
        <p>A won game is worth <strong>3 petals for the win, plus the official victory points</strong> (one per tile left in the garden), plus whatever your charms add. A lost game is worth nothing. Charms only read the finished game: they never change which tiles you may take or how a game is won. When a move completes a line or square and also blocks the rival, it counts as the line or square.</p>
        <h4 class="rule-sub">The Firefly</h4>
        <p>The <strong>Firefly</strong> may be woken once per station: for one move it marks the tiles that win at once and the tiles that hand the rival a win. It only shows information.</p>
      </section></div>`;
    }
    if (this.s.showCharm) {
      const c = CHARM_BY_ID[this.s.showCharm];
      html += `<div class="sheet-backdrop" data-action="close"><section class="sheet charm-sheet" role="dialog" aria-label="${escapeHtml(c.name)}" onclick="event.stopPropagation()">
        <button class="icon-btn close" data-action="close" aria-label="Close">×</button>
        <span class="charm-icon big">${charmGlyph(c)}</span>
        <h2>${escapeHtml(c.name)}</h2>
        <p>${escapeHtml(c.rule)}</p>
        <p class="muted">Charms score a finished game. The rules of Okiya are untouched.</p>
      </section></div>`;
    }
    return html;
  }

  private mountBoard(run: RunState): void {
    const el = this.root.querySelector<HTMLElement>('#board');
    if (!el || !run.game) return;
    const game = run.game;
    const yourTurn = game.current === HUMAN && !game.win && run.phase === 'playing';
    const hints: Map<number, FireflyHint> = this.s.fireflyLit && yourTurn ? fireflyHints(game, HUMAN) : new Map();
    const charmCls = charmCellClasses(game, HUMAN, run.held);
    const rival = escapeHtml(currentStation(run).rival.name);
    renderBoard(el, game, {
      human: run.phase === 'playing' && !this.s.aiThinking ? HUMAN : null,
      onMove: (i) => this.humanMove(i),
      lastIndex: this.s.lastIndex,
      cellClass: (i) => {
        const h = hints.get(i);
        return [charmCls(i), h ? `firefly-${h}` : ''].filter(Boolean).join(' ');
      },
      cellBadge: (i) => {
        const h = hints.get(i);
        if (h === 'win') return `<span class="badge badge-win">${petalIcon()} wins</span>`;
        if (h === 'danger') return `<span class="badge badge-danger">! ${rival} wins next</span>`;
        return '';
      },
    });
    el.classList.toggle('has-legal', yourTurn);
    el.classList.toggle('firefly-on', hints.size > 0);
    el.classList.toggle('rival-turn', !yourTurn && !game.win);
  }

  private animateCounter(): void {
    const counter = this.root.querySelector<HTMLElement>('.count-up');
    if (!counter || counter.dataset.done) return;
    counter.dataset.done = '1';
    const target = Number(counter.dataset.count);
    if (!(target > 0) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      counter.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

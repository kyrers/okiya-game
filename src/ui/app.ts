/**
 * Hanamichi — The Flower Road. Single-page app, framework-free.
 * Every Okiya game is played through the engine; this file only renders and sequences.
 */
import { chooseMove } from '../engine/ai';
import { CHARMS, CHARM_BY_ID, type CharmId } from '../engine/charms';
import { applyMove, legalMoves, mulberry32, tilesRemaining, type GameState, type Tile } from '../engine/okiya';
import { charmCellClasses, lanternHints, worthNow, type LanternHint } from '../game/hints';
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
  useLantern,
  type RunState,
} from '../game/run';
import { MAX_HELD, STATIONS } from '../game/stations';
import { renderBoard } from './board';
import { charmGlyph } from './charmArt';
import { escapeHtml } from './dom';
import { okiyaRulesHtml } from './rulesPanel';
import { dailySeed, loadJson, saveJson } from './storage';
import { SYM_LABEL, VEG_LABEL, symGlyph, tileLabel, tileSvg, vegGlyph } from './tileArt';

interface Meta {
  runsStarted: number;
  runsWon: number;
  bestStation: number; // 1-based station reached (0 = none)
  bestPetals: number;
  discovered: CharmId[];
}

const RUN_KEY = 'hanamichi.run.v1';
const META_KEY = 'hanamichi.meta.v1';

type View = 'title' | 'run';

interface UiState {
  view: View;
  run: RunState | null;
  meta: Meta;
  showRules: boolean;
  showCharm: CharmId | null;
  lanternLit: boolean;
  lastIndex: number | null;
  aiThinking: boolean;
  releasing: CharmId | null; // when the hand is full: the offered charm chosen, awaiting a release
  resultShown: boolean;
}

export class App {
  private s: UiState;
  private root: HTMLElement;
  private aiTimer: number | null = null;
  private gameRng: () => number = mulberry32(1);

  constructor(root: HTMLElement) {
    this.root = root;
    const run = loadJson<RunState | null>(RUN_KEY, null);
    this.s = {
      view: 'title',
      run: run && run.phase !== 'won' && run.phase !== 'lost' ? run : null,
      meta: loadJson<Meta>(META_KEY, { runsStarted: 0, runsWon: 0, bestStation: 0, bestPetals: 0, discovered: [] }),
      showRules: false,
      showCharm: null,
      lanternLit: false,
      lastIndex: null,
      aiThinking: false,
      releasing: null,
      resultShown: false,
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
    this.s.lanternLit = false;
    this.s.lastIndex = null;
    this.setRun(newRun(seed));
    this.render();
  }

  private resumeRun(): void {
    this.s.view = 'run';
    this.render();
    this.maybeScheduleAi();
  }

  private gameRngFor(run: RunState): () => number {
    return mulberry32((run.seed + run.station * 1000 + run.gamesPlayed * 7 + 1) >>> 0 ^ 0xabcdef);
  }

  private startNextGame(run: RunState): void {
    const next = startGame(run);
    this.gameRng = this.gameRngFor(next);
    this.s.lanternLit = false;
    this.s.lastIndex = null;
    this.s.resultShown = false;
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
    this.s.lanternLit = false;
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
        this.s.resultShown = true;
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
      case 'abandon':
        this.setRun(null);
        this.s.view = 'title';
        this.render();
        break;
      case 'title':
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
        this.startNextGame(run);
        break;
      case 'lantern':
        if (!run || run.lanternUsed || run.phase !== 'playing' || run.game?.current !== HUMAN) return;
        this.setRun(useLantern(run));
        this.s.lanternLit = true;
        this.render();
        break;
      case 'continue': {
        if (!run || run.phase !== 'result') return;
        const next = continueRun(run);
        if (next.phase === 'playing') {
          this.gameRng = this.gameRngFor(next);
          this.s.lanternLit = false;
          this.s.lastIndex = null;
          this.s.resultShown = false;
          this.setRun(next);
          this.render();
          this.maybeScheduleAi();
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
  }

  private renderTitle(): string {
    const { meta, run } = this.s;
    const resumable = run && run.phase !== 'won' && run.phase !== 'lost';
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
      <section class="record">
        <div><span class="num">${meta.runsWon}</span><span class="lbl">roads completed</span></div>
        <div><span class="num">${meta.bestStation}/${STATIONS.length}</span><span class="lbl">furthest station</span></div>
        <div><span class="num">${meta.bestPetals}</span><span class="lbl">most petals in a road</span></div>
      </section>
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

  private charmCard(id: CharmId, action: string, extra = ''): string {
    const c = CHARM_BY_ID[id];
    return `<button type="button" class="charm-card ${extra}" data-action="${action}" data-charm="${id}">
      <span class="charm-icon">${charmGlyph(c)}</span>
      <span class="charm-name">${escapeHtml(c.name)}</span>
      <span class="charm-rule">${escapeHtml(c.rule)}</span>
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
      <section class="panel">
        <h2>${first ? 'Choose your first charm' : 'A charm for the road ahead'}</h2>
        <p class="muted">Charms never change how Okiya is played. They decide how many petals a <em>win</em> is worth.</p>
        ${releasing ? `<p class="notice">Your hand is full. Release one charm to take <strong>${escapeHtml(CHARM_BY_ID[releasing].name)}</strong>, or <button class="link" data-action="cancel-release">keep your hand</button>.</p>` : ''}
        <div class="charm-grid">
          ${run.offers.map((id) => this.charmCard(id, 'pick', releasing === id ? 'selected' : releasing ? 'dimmed' : '')).join('')}
        </div>
        ${run.held.length ? `<h3 class="held-title">Your hand ${full ? '(full)' : `(${run.held.length}/${MAX_HELD})`}</h3>
        <div class="charm-grid small">${run.held.map((id) => this.charmCard(id, releasing ? 'release' : 'charm-info', releasing ? 'release-target' : '')).join('')}</div>` : ''}
        ${!first ? `<div class="row-actions"><button class="btn btn-ghost" data-action="skip-draft">Walk on without a new charm</button></div>` : ''}
      </section>
    </main>`;
  }

  private topBar(run: RunState, context: string): string {
    return `<header class="topbar">
      <button class="link brand" data-action="title">Hanamichi</button>
      <span class="context">${escapeHtml(context)}</span>
      <span class="spacer"></span>
      <span class="petal-total" title="Petals gathered on this road">${run.totalPetals} <span class="petal-mark" aria-hidden="true">✿</span></span>
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

  private renderIntro(run: RunState): string {
    const st = currentStation(run);
    return `
    <main class="screen intro-screen">
      ${this.topBar(run, `${st.season} · station ${st.index + 1} of ${STATIONS.length}`)}
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
          <div><dt>Target</dt><dd>${st.target} <span class="petal-mark">✿</span></dd></div>
          <div><dt>Lanterns</dt><dd>${st.lanterns} games</dd></div>
          <div><dt>First move</dt><dd>${run.nextFirst === HUMAN ? 'You' : st.rival.name}</dd></div>
        </dl>
        <p class="muted">Gather ${st.target} petals across the lanterns to walk on. ${run.nextFirst === HUMAN ? 'You open the garden.' : `${st.rival.name} opens; the loser of each game starts the next.`}</p>
        <div class="row-actions">
          <button class="btn btn-primary" data-action="start-game">Light the first lantern</button>
        </div>
        ${run.held.length ? `<div class="hand-strip">${run.held.map((id) => this.charmChip(id)).join('')}</div>` : ''}
      </section>
      <aside class="side">${this.road(run)}</aside>
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
        <span class="constraint-label">${game.current === HUMAN ? 'Your opening' : `${escapeHtml(rivalName)} opens`}</span>
        <span class="constraint-text">Any tile on the <strong>outer border</strong>. The four centre tiles are closed on move one.</span>
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

  private renderPlay(run: RunState): string {
    const st = currentStation(run);
    const game = run.game!;
    const target = st.target;
    const pct = Math.min(100, Math.round((100 * run.stationPetals) / target));
    const lanterns = Array.from({ length: st.lanterns }, (_, i) => {
      const lit = i < run.gamesPlayed || (i === run.gamesPlayed && run.phase === 'playing');
      const burning = i === run.gamesPlayed && run.phase === 'playing';
      return `<span class="lantern ${lit ? 'lit' : ''} ${burning ? 'burning' : ''}" aria-label="lantern ${i + 1} ${lit ? 'lit' : 'unlit'}"></span>`;
    }).join('');
    const yourTurn = game.current === HUMAN && !game.win && run.phase === 'playing';
    const status = game.win
      ? game.win.winner === HUMAN
        ? `You win by ${game.win.reason === 'blocked' ? 'blocking' : game.win.reason}!`
        : `${st.rival.name} wins by ${game.win.reason === 'blocked' ? 'blocking you' : game.win.reason}.`
      : yourTurn
        ? 'Your move'
        : `${st.rival.name} is thinking…`;
    const worth = worthNow(game, HUMAN, run.held);
    const myTokens = game.history.filter((m) => m.player === HUMAN).length;
    const rivalTokens = game.history.length - myTokens;
    return `
    <main class="screen play-screen season-${st.season.toLowerCase()}">
      ${this.topBar(run, `${st.place} · ${st.rival.name} ${st.rival.title}`)}
      <aside class="road-col"><p class="eyebrow">${escapeHtml(st.season)} · station ${st.index + 1} of ${STATIONS.length}</p>${this.road(run)}</aside>
      <section class="centre">
      <section class="hud">
        <div class="hud-row">
          <div class="lanterns" title="${lanternsLeft(run)} lantern(s) left">${lanterns}</div>
          <div class="target">
            <div class="target-text"><strong>${run.stationPetals}</strong> / ${target} <span class="petal-mark">✿</span></div>
            <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${run.stationPetals}"><span style="width:${pct}%"></span></div>
          </div>
        </div>
        <p class="status ${yourTurn ? 'your-turn' : ''} ${game.win ? 'finished' : ''}" aria-live="polite">${escapeHtml(status)}</p>
      </section>
        <div class="players">
          <div class="player me ${game.current === HUMAN && !game.win ? 'active' : ''}"><span class="token-mini p1"></span>You <small>${8 - myTokens} left</small></div>
          <div class="player rival ${game.current !== HUMAN && !game.win ? 'active' : ''}"><small>${8 - rivalTokens} left</small>${escapeHtml(st.rival.name)}<span class="token-mini p2"></span></div>
        </div>
        <div id="board" class="board"></div>
        ${this.constraintHtml(game, st.rival.name)}
      </section>
      <aside class="side tray">
        <div class="worth">
          <span class="worth-label">A win now is worth</span>
          <span class="worth-num">${worth.total} <span class="petal-mark">✿</span></span>
          <span class="worth-detail">${worth.base} base · ${worth.tiles} tile${worth.tiles === 1 ? '' : 's'} left${worth.adds.map((a) => ` · +${a.add} ${escapeHtml(CHARM_BY_ID[a.id].name)}`).join('')}${worth.conditional.length ? ` · plus ${worth.conditional.map((id) => escapeHtml(CHARM_BY_ID[id].name)).join(', ')} if they fire` : ''}</span>
        </div>
        <div class="hand">
          <h3>Charms</h3>
          <div class="hand-strip">${run.held.length ? run.held.map((id) => this.charmChip(id)).join('') : '<span class="muted">none yet</span>'}</div>
        </div>
        <button class="btn lantern-btn ${run.lanternUsed ? 'used' : ''} ${this.s.lanternLit ? 'lit' : ''}" data-action="lantern" ${run.lanternUsed || !yourTurn ? 'disabled' : ''}>
          <span class="lantern-icon" aria-hidden="true"></span>
          <span>${this.s.lanternLit ? 'Lantern lit for this move' : run.lanternUsed ? 'Paper Lantern spent here' : 'Light the Paper Lantern'}</span>
          <span class="btn-sub">${this.s.lanternLit ? 'gold wins now · red hands the rival a win' : 'once per station: reveals winning and dangerous tiles'}</span>
        </button>
        ${this.road(run)}
      </aside>
      ${run.phase === 'result' && run.lastResult ? this.renderResult(run) : ''}
    </main>`;
  }

  private renderResult(run: RunState): string {
    const st = currentStation(run);
    const r = run.lastResult!;
    const cleared = stationCleared(run);
    const left = lanternsLeft(run);
    const rows: string[] = [];
    if (r.won) {
      rows.push(`<li><span>Victory</span><span>+${r.base}</span></li>`);
      rows.push(`<li><span>${r.tilesRemaining} tile${r.tilesRemaining === 1 ? '' : 's'} left in the garden</span><span>+${r.tilesRemaining}</span></li>`);
      for (const e of r.effects) {
        const fired = e.effect.add || e.effect.mult;
        rows.push(`<li class="${fired ? 'fired' : 'quiet'}"><span>${charmGlyph(e.charm)} ${escapeHtml(e.charm.name)}${fired ? ` <small>${escapeHtml(e.effect.note)}</small>` : ' <small>did not bloom</small>'}</span><span>${e.effect.mult ? `×${1 + e.effect.mult}` : e.effect.add ? `+${e.effect.add}` : '—'}</span></li>`);
      }
    } else {
      rows.push(`<li><span>${escapeHtml(st.rival.name)} wins by ${r.won ? '' : escapeHtml(run.log[run.log.length - 1]?.reason === 'blocked' ? 'blocking you' : run.log[run.log.length - 1]?.reason ?? '')}</span><span>0</span></li>`);
    }
    let cta: string;
    if (cleared) cta = run.station >= STATIONS.length - 1 ? 'Reach the end of the road' : 'Walk on to the next station';
    else if (left > 0) cta = `Light the next lantern <span class="btn-sub">${left} left · ${st.target - run.stationPetals} petals to go</span>`;
    else cta = 'The road ends here';
    return `<div class="sheet-backdrop">
      <section class="sheet result ${r.won ? 'won' : 'lost'}" role="dialog" aria-label="Game result">
        <p class="eyebrow">${cleared ? 'Station cleared' : left > 0 ? `Lantern ${run.gamesPlayed} of ${st.lanterns}` : 'Lanterns spent'}</p>
        <h2>${r.won ? 'The garden blooms' : 'The garden fades'}</h2>
        <ul class="tally">${rows.join('')}</ul>
        <p class="tally-total"><span>Petals this game</span><span class="count-up" data-count="${r.total}">${r.total}</span></p>
        <p class="tally-station">Station: <strong>${run.stationPetals}</strong> / ${st.target} <span class="petal-mark">✿</span></p>
        <button class="btn btn-primary" data-action="continue">${cta}</button>
      </section>
    </div>`;
  }

  private renderEnd(run: RunState): string {
    const won = run.phase === 'won';
    const st = currentStation(run);
    const wins = run.log.filter((l) => l.won).length;
    return `
    <main class="screen end-screen">
      ${this.topBar(run, won ? 'The end of the road' : 'The road ends')}
      <section class="panel end ${won ? 'won' : 'lost'}">
        <p class="eyebrow">${won ? 'Winter, Snow Pavilion' : `${st.season}, ${escapeHtml(st.place)}`}</p>
        <h2>${won ? 'You walked the whole Flower Road' : `${escapeHtml(st.rival.name)} closes the gate`}</h2>
        <p class="lede">${won ? 'Every garden bloomed. Okasan bows.' : `${run.stationPetals} of ${st.target} petals gathered at station ${run.station + 1}.`}</p>
        <dl class="station-facts">
          <div><dt>Petals</dt><dd>${run.totalPetals} <span class="petal-mark">✿</span></dd></div>
          <div><dt>Games won</dt><dd>${wins} / ${run.log.length}</dd></div>
          <div><dt>Stations</dt><dd>${won ? STATIONS.length : run.station} / ${STATIONS.length}</dd></div>
        </dl>
        <ol class="log">${run.log.map((l) => `<li class="${l.won ? 'won' : 'lost'}"><span>${escapeHtml(STATIONS[l.station].place)} · lantern ${l.game + 1}</span><span>${l.won ? `won by ${l.reason}` : `lost (${l.reason})`} · ${l.moves} moves</span><span>${l.petals} ✿</span></li>`).join('')}</ol>
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
        <h3>The road</h3>
        <p>Walk six stations. At each one you have <strong>three lanterns</strong>: three full games of Okiya against the station's rival. Gather the station's <strong>petal target</strong> before the lanterns run out and you walk on, drafting a new charm. Miss it and the road ends.</p>
        <p>A won game is worth <strong>3 + the tiles left in the garden</strong> petals (the official victory-point rule), plus whatever your charms add. A lost game is worth nothing. Charms only read the finished game: they never change which tiles you may take or how a game is won.</p>
        <p>The <strong>Paper Lantern</strong> may be lit once per station: for one move it shows which tiles win at once (gold) and which hand the rival a win (red). It only shows information.</p>
        <h3>Okiya, the game at the core</h3>
        ${okiyaRulesHtml()}
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
    const hints: Map<number, LanternHint> = this.s.lanternLit && game.current === HUMAN && !game.win ? lanternHints(game, HUMAN) : new Map();
    const charmCls = charmCellClasses(game, HUMAN, run.held);
    renderBoard(el, game, {
      human: run.phase === 'playing' && !this.s.aiThinking ? HUMAN : null,
      onMove: (i) => this.humanMove(i),
      lastIndex: this.s.lastIndex,
      cellClass: (i) => {
        const h = hints.get(i);
        return [charmCls(i), h ? `lantern-${h}` : ''].filter(Boolean).join(' ');
      },
    });
    const yourTurn = game.current === HUMAN && !game.win && run.phase === 'playing';
    el.classList.toggle('has-legal', yourTurn);
    el.classList.toggle('lantern-on', hints.size > 0);
    el.classList.toggle('rival-turn', !yourTurn && !game.win);
    // Count-up animation on the result total.
    const counter = this.root.querySelector<HTMLElement>('.count-up');
    if (counter && !counter.dataset.done) {
      counter.dataset.done = '1';
      const target = Number(counter.dataset.count);
      const start = performance.now();
      const dur = 700;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        counter.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      if (target > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(tick);
    }
    void tilesRemaining;
    void CHARMS;
  }
}

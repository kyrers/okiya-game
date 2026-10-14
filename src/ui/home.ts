/** The home screen: the two halves again, the way into a game, and a picture of the game on the seam. */
import { applyMove, legalMoves, mulberry32, newGame, type GameState, type Player, type Tile } from '../engine/garden';
import type { MatchView } from '../game/match';
import { icon, tokenSvg } from './art';
import { staticGarden } from './board';
import { tileSvg } from './tileArt';
import { DIFFICULTY_WORD, MODE_WORD } from './words';

export interface HomeActions {
  continueMatch(): void;
  newMatch(): void;
  rules(): void;
  demo(): void;
  settings(): void;
}

export function homeScreen(saved: MatchView | null, actions: HomeActions): HTMLElement {
  const el = document.createElement('main');
  el.className = 'screen home';
  const resumable = saved && !saved.match.over;
  el.innerHTML = `
    <section class="home-title">
      <h1 class="wordmark"><span>Paper</span> <span>Garden</span></h1>
    </section>
    <div class="home-actions-wrap"><section class="home-actions">
      <div class="home-buttons">
        ${resumable ? `<button type="button" class="btn primary big" data-go="continue">${icon('play')}<span><span class="btn-title">Continue</span><span class="btn-sub">${summary(saved!)}</span></span></button>` : ''}
        <button type="button" class="btn ${resumable ? 'secondary' : 'primary'} big" data-go="new">${resumable ? icon('restart') : icon('play')}<span><span class="btn-title">New game</span><span class="btn-sub">Against the computer or a&nbsp;friend</span></span></button>
      </div>
      <nav class="home-links" aria-label="More">
        <button type="button" class="link-btn" data-go="rules">${icon('book')} <span class="link-label">How to play</span></button>
        <button type="button" class="link-btn" data-go="demo">${icon('watch')} <span class="link-label">Watch a game</span></button>
        <button type="button" class="link-btn" data-go="settings">${icon('sliders')} <span class="link-label">Settings</span></button>
      </nav>
    </section></div>
    <div class="seam home-seam"></div>`;
  // A picture of the game, not a board to play on: a garden lying on the table, seen at an angle, a
  // few moves into a game (a different one each visit), the taken tiles and some spare tokens
  // resting on the cloth beside it. Inert: nothing in it can be pressed, focused or read out.
  const { state, taken } = gameInProgress(Math.floor(Math.random() * 2 ** 31));
  const garden = staticGarden(state);
  const scene = document.createElement('div');
  scene.className = 'home-garden';
  scene.setAttribute('aria-hidden', 'true');
  scene.inert = true;
  const table = document.createElement('div');
  table.className = 'home-table';
  // Each player's taken tiles and spare tokens lie on their own half: vermilion near, indigo far.
  const pieces = [
    ...taken.map(({ tile, player }, k) => `<span class="home-piece home-tile p${player} n${k >> 1}">${tileSvg(tile)}</span>`),
    ...[0, 1, 2].map((k) => `<span class="home-piece home-token p1 n${k}">${tokenSvg(1)}</span>`),
    ...[0, 1].map((k) => `<span class="home-piece home-token p2 n${k}">${tokenSvg(2)}</span>`),
  ];
  table.innerHTML = pieces.join('');
  table.prepend(garden);
  scene.append(table);
  el.querySelector('.home-seam')!.append(scene);
  // The garden takes what the title, the buttons and the links leave. The stylesheet estimates their
  // height; a long Continue summary (long names) can need more, and then the garden gives the
  // difference. The buttons are as wide as the garden, so they may grow again: a few passes settle it.
  const fit = () => {
    el.style.removeProperty('--home-board-fit');
    if (matchMedia('(max-height: 500px) and (min-aspect-ratio: 5/4)').matches) return;
    for (let pass = 0; pass < 4; pass++) {
      const rows = getComputedStyle(el).gridTemplateRows.split(' ').map(parseFloat);
      const over = rows.reduce((a, b) => a + b, 0) - el.clientHeight;
      if (!(over > 0.5)) return;
      // The scene's own width: the garden inside it is drawn at an angle, so its box is not its size.
      const board = scene.offsetWidth;
      el.style.setProperty('--home-board-fit', `${Math.max(96, Math.floor(board - over))}px`);
    }
  };
  // The mats lie in the garden's plane, wherever the layout puts the garden: they turn about its
  // scene's centre (where the board turns), and are cut to what the screen shows of them.
  if (typeof ResizeObserver !== 'undefined') {
    const place = () => {
      fit();
      const s = scene.getBoundingClientRect();
      const h = el.getBoundingClientRect();
      if (s.height === 0) return;
      const x = s.left - h.left + s.width / 2;
      const y = s.top - h.top + s.height / 2;
      el.style.setProperty('--home-seam', `${Math.round(y)}px`);
      el.style.setProperty('--home-seam-x', `${Math.round(x)}px`);
      // The camera the stylesheet gives the picture: tilt, the eye's distance and its height above
      // the centre. Solve how far along the floor the screen's top and bottom edges fall, and how
      // wide the floor must be at its far edge to reach both sides.
      const css = getComputedStyle(el);
      const tilt = (parseFloat(css.getPropertyValue('--home-tilt')) * Math.PI) / 180;
      const d = s.width * parseFloat(css.getPropertyValue('--home-depth'));
      const up = s.width * parseFloat(css.getPropertyValue('--home-eye'));
      if (!(tilt > 0 && d > 0 && up >= 0)) return;
      const c = Math.cos(tilt);
      const sin = Math.sin(tilt);
      const above = y;
      const below = h.height - y;
      const room = c * d - (above - up) * sin;
      // Beyond the horizon (a very tall, narrow window) the floor stops and the room shows past it.
      const far = room > 0 ? Math.min((above * d) / room, s.width * 12) : s.width * 12;
      // An engine that draws the mats flat (Playwright's WebKit does) needs them a little longer
      // towards the eye: enough for both, so no edge ever shows.
      const near = Math.max((below * d) / (c * d + (below + up) * sin), below / c);
      const half = Math.max(x, h.width - x) * (1 + (far * sin) / d);
      el.style.setProperty('--floor-far', `${Math.ceil(far * 1.06 + 16)}px`);
      el.style.setProperty('--floor-near', `${Math.ceil(near * 1.06 + 16)}px`);
      el.style.setProperty('--floor-w', `${2 * Math.ceil(half * 1.04 + 16)}px`);
    };
    new ResizeObserver(place).observe(el);
    // The buttons' text changes size when the fonts arrive; the screen itself does not.
    void document.fonts?.ready.then(() => el.isConnected && place());
  }
  el.addEventListener('click', (ev) => {
    const go = (ev.target as Element).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'continue') actions.continueMatch();
    else if (go === 'new') actions.newMatch();
    else if (go === 'rules') actions.rules();
    else if (go === 'demo') actions.demo();
    else if (go === 'settings') actions.settings();
  });
  return el;
}

/** A game a few moves in: four legal moves (two each), so no formation yet and twelve tiles still face up. */
function gameInProgress(seed: number): { state: GameState; taken: { tile: Tile; player: Player }[] } {
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  let state = newGame(seed);
  const taken: { tile: Tile; player: Player }[] = [];
  for (let k = 0; k < 4; k++) {
    const moves = legalMoves(state);
    if (moves.length === 0) break;
    const i = moves[Math.floor(rnd() * moves.length)];
    const cell = state.board[i];
    if (cell.kind === 'tile') taken.push({ tile: cell.tile, player: state.current });
    state = applyMove(state, i);
  }
  // Very rarely the next player is left with no tile to take, which ends the game: deal again.
  return state.result || taken.length < 4 ? gameInProgress(seed + 1) : { state, taken };
}

function summary(v: MatchView): string {
  const s = v.saved.setup;
  const who = s.opponent === 'computer' ? `vs Computer, ${DIFFICULTY_WORD[s.difficulty]}` : `<bdi>${esc(s.names[0])}</bdi> vs <bdi>${esc(s.names[1])}</bdi>`;
  // A no-break space before each separator, so a line never starts with one.
  // Short phrases stay whole: "20 points", "Game 3".
  const parts = [who, MODE_WORD[s.mode].replace(/(\d+) /, '$1\u00a0')];
  if (s.mode !== 'single') parts.push(`Game\u00a0${v.gameNumber}`);
  return parts.join('\u00a0· ');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

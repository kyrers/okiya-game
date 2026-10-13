/** The home screen: the two halves again, the way into a game, and the garden on the seam. */
import { newGame } from '../engine/garden';
import type { MatchView } from '../game/match';
import { icon } from './art';
import { staticGarden } from './board';
import { DIFFICULTY_WORD, MODE_WORD } from './words';

export interface HomeActions {
  continueMatch(): void;
  newMatch(): void;
  rules(): void;
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
        <button type="button" class="link-btn" data-go="rules">${icon('book')} How to play</button>
        <button type="button" class="link-btn" data-go="settings">${icon('sliders')} Settings</button>
      </nav>
    </section></div>
    <div class="seam home-seam"></div>`;
  // A different garden each visit, all sixteen tiles face up.
  const garden = staticGarden(newGame(Math.floor(Math.random() * 2 ** 31)));
  el.querySelector('.home-seam')!.append(garden);
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
      const board = garden.getBoundingClientRect().width;
      el.style.setProperty('--home-board-fit', `${Math.max(96, Math.floor(board - over))}px`);
    }
  };
  // The two dyes meet at the garden's centre line (portrait), wherever the layout puts it.
  if (typeof ResizeObserver !== 'undefined') {
    const place = () => {
      fit();
      const g = garden.getBoundingClientRect();
      const h = el.getBoundingClientRect();
      if (g.height === 0) return;
      el.style.setProperty('--home-seam', `${Math.round(g.top - h.top + g.height / 2)}px`);
      el.style.setProperty('--home-seam-x', `${Math.round(g.left - h.left + g.width / 2)}px`);
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
    else if (go === 'settings') actions.settings();
  });
  return el;
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

/** The home screen: the two halves again, the garden on the seam, and the way into a game. */
import { newGame } from '../engine/okiya';
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
      <h1 class="wordmark">Okiya</h1>
      <p class="home-sub">Game design by <span class="nowrap">Bruno Cathala</span> &amp; <span class="nowrap">Cyril Bouquet</span></p>
    </section>
    <div class="seam home-seam"></div>
    <div class="home-actions-wrap"><section class="home-actions">
      ${resumable ? `<button type="button" class="btn primary big" data-go="continue">${icon('play')}<span><span class="btn-title">Continue</span><span class="btn-sub">${summary(saved!)}</span></span></button>` : ''}
      <button type="button" class="btn ${resumable ? 'secondary' : 'primary'} big" data-go="new">${resumable ? icon('restart') : icon('play')}<span><span class="btn-title">New game</span><span class="btn-sub">Against the computer or a friend</span></span></button>
      <nav class="home-links" aria-label="More">
        <button type="button" class="link-btn" data-go="rules">${icon('book')} How to play</button>
        <button type="button" class="link-btn" data-go="settings">${icon('sliders')} Settings</button>
      </nav>
    </section></div>`;
  // A different garden each visit, all sixteen tiles face up.
  const garden = staticGarden(newGame(Math.floor(Math.random() * 2 ** 31)));
  el.querySelector('.home-seam')!.append(garden);
  // The two dyes meet at the garden's centre line (portrait), wherever the layout puts it.
  if (typeof ResizeObserver !== 'undefined') {
    const place = () => {
      const g = garden.getBoundingClientRect();
      const h = el.getBoundingClientRect();
      if (g.height > 0) el.style.setProperty('--home-seam', `${Math.round(g.top - h.top + g.height / 2)}px`);
    };
    new ResizeObserver(place).observe(el);
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
  const who = s.opponent === 'computer' ? `vs Computer, ${DIFFICULTY_WORD[s.difficulty]}` : `${esc(s.names[0])} vs ${esc(s.names[1])}`;
  // A no-break space before each separator, so a line never starts with one.
  const parts = [who, MODE_WORD[s.mode]];
  if (s.mode !== 'single') parts.push(`Game ${v.gameNumber}`);
  return parts.join('\u00a0· ');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

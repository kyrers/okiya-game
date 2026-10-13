/** The contents of the setup, settings and in-game menu sheets. */
import type { Difficulty } from '../engine/ai';
import type { MatchMode } from '../engine/garden';
import { NAME_MAX, defaultNames, type Opponent } from '../game/match';
import { icon, tokenSvg, type IconName } from './art';
import type { SetupDraft, Settings } from './prefs';
import { MODE_WORD } from './words';

const LEVELS: { id: Difficulty; title: string; detail: string }[] = [
  { id: 'easy', title: 'Easy', detail: 'Plays loosely. Good for a first game.' },
  { id: 'medium', title: 'Medium', detail: 'Plays carefully, with the odd slip.' },
  { id: 'hard', title: 'Hard', detail: 'Looks five moves ahead. Hard to beat.' },
];

/**
 * Who opens, said once beside Start (and in the form itself on a phone held sideways, where Start
 * moves onto the title band). Its parts follow the choices through CSS (.sheet-setup:has(...)):
 * the colour against the computer; the loser's turn to open only when there is a next game.
 */
const OPENER_NOTE =
  '<span class="note-cpu">You play vermilion. </span>' +
  '<span class="note-single">Who opens is drawn at random.</span>' +
  '<span class="note-match">Who opens the first game is drawn at random; after that, the loser of each game opens the next (after a tie, the other player opens).</span>';

/** The New game sheet's footer: the opener's note, then Start, which submits the form by id. */
export function startButton(): HTMLElement {
  const foot = document.createElement('div');
  foot.className = 'setup-foot';
  foot.innerHTML = `<p class="setup-note">${OPENER_NOTE}</p>`;
  const b = document.createElement('button');
  b.type = 'submit';
  b.className = 'btn primary big start-btn';
  b.setAttribute('form', 'setup-form');
  b.innerHTML = `${icon('play')}<span class="btn-title">Start</span>`;
  foot.append(b);
  return foot;
}

/**
 * The New game form. Its choices go to onDraft as they are made, not only to onStart, so closing
 * the sheet (to read the rules, or to come back later) keeps them. Who plays, and the level or the
 * names, are always in view; the kind of match waits behind a Match row that names the current
 * choice, closed each time the sheet opens.
 */
export function setupForm(initial: SetupDraft, onStart: (s: SetupDraft) => void, onDraft?: (s: SetupDraft) => void): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'setup';
  form.noValidate = true;
  const pointsTarget = initial.target;
  const matchKind = initial.mode.startsWith('points') ? 'points' : initial.mode;
  const names = initial.names;
  const humanDefaults = defaultNames('human');
  form.innerHTML = `
    <fieldset class="f-opp">
      <legend>Play against</legend>
      <div class="seg">
        ${seg('opponent', 'computer', 'The computer', initial.opponent === 'computer')}
        ${seg('opponent', 'human', 'A friend, on this\u00a0device', initial.opponent === 'human')}
      </div>
    </fieldset>
    <fieldset class="choices f-level" data-for="computer">
      <legend>Level</legend>
      ${LEVELS.map((l) => choice('difficulty', l.id, l.title, l.detail, initial.difficulty === l.id)).join('')}
    </fieldset>
    <fieldset class="names f-names" data-for="human">
      <legend>Names</legend>
      ${nameField(1, names[0] === humanDefaults[0] ? '' : names[0], humanDefaults[0])}
      ${nameField(2, names[1] === humanDefaults[1] ? '' : names[1], humanDefaults[1])}
    </fieldset>
    <div class="setup-side">
      <div class="f-match">
        <button type="button" class="more-toggle" aria-expanded="false" aria-controls="setup-match">
          <span class="more-label">Match</span>
          <span class="more-value"><span class="more-current"></span>${CHEVRON}</span>
        </button>
        <fieldset class="choices more-options" id="setup-match" hidden>
          <legend class="sr-only">Match</legend>
          ${choice('match', 'single', 'Single game', 'One game decides it.', matchKind === 'single')}
          ${choice('match', 'sets3', 'First to 3 wins', 'Play on until someone has won three games.', matchKind === 'sets3')}
          ${choice('match', 'points', 'Victory points', 'A win scores one point per tile still in the garden.', matchKind === 'points')}
          <div class="seg small" data-for="points" role="radiogroup" aria-label="Points to win">
            ${(['points10', 'points15', 'points20'] as const).map((m) => seg('target', m, `${m.slice(6)} points`, pointsTarget === m)).join('')}
          </div>
        </fieldset>
      </div>
      <p class="setup-note">${OPENER_NOTE}</p>
    </div>`;
  form.id = 'setup-form';

  const more = form.querySelector<HTMLButtonElement>('.more-toggle')!;
  const options = form.querySelector<HTMLElement>('.more-options')!;
  const current = form.querySelector<HTMLElement>('.more-current')!;
  more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(open));
    options.hidden = !open;
    // Opened, the choices come into view when they lie under the sheet's lower edge (in portrait,
    // under the footer): the sheet's body scrolls just far enough, never past the row itself, and
    // not at all when they are already in view (as on most phones held sideways, where the row
    // heads the right-hand column). The row and its choices are measured together, by their
    // wrapper, since the choices' opening animation moves them.
    const scroller = form.closest<HTMLElement>('.sheet-body');
    if (open && scroller) {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
      requestAnimationFrame(() => {
        const view = scroller.getBoundingClientRect();
        const group = more.parentElement!.getBoundingClientRect();
        const by = Math.min(group.bottom + parseFloat(getComputedStyle(scroller).paddingBottom) - view.bottom, group.top - view.top);
        if (by > 0) scroller.scrollBy({ top: by, behavior: still ? 'auto' : 'smooth' });
      });
    }
  });

  const sync = () => {
    const opp = (form.elements.namedItem('opponent') as RadioNodeList).value as Opponent;
    const match = (form.elements.namedItem('match') as RadioNodeList).value;
    form.querySelectorAll<HTMLElement>('[data-for]').forEach((el) => {
      const f = el.dataset.for;
      el.hidden = f === 'points' ? match !== 'points' : f !== opp;
    });
    // Written only when the choice changed. A name field's change comes on blur, inside the press
    // that moves focus to the Match row: rewriting the same word there replaced the text under the
    // finger, and WebKit, whose click goes to the node pressed, then sent no click at all.
    const word = MODE_WORD[read().mode];
    if (current.textContent === word) return;
    current.textContent = word;
    more.setAttribute('aria-label', `Match: ${word}`);
  };
  const read = (): SetupDraft => {
    const val = (n: string) => (form.elements.namedItem(n) as RadioNodeList | HTMLInputElement).value;
    const match = val('match');
    return {
      opponent: val('opponent') as Opponent,
      difficulty: val('difficulty') as Difficulty,
      mode: (match === 'points' ? val('target') : match) as MatchMode,
      names: [val('name1'), val('name2')],
      target: val('target') as MatchMode,
    };
  };
  form.addEventListener('change', () => {
    sync();
    onDraft?.(read());
  });
  form.addEventListener('input', () => onDraft?.(read()));
  sync();
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    onStart(read());
  });
  return form;
}

/** A chevron on the icons' 24px grid; it turns over when the Match row opens. */
const CHEVRON = '<svg class="icon more-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l5.5 5.5 5.5-5.5"/></svg>';

function seg(name: string, value: string, label: string, checked: boolean): string {
  return `<label class="seg-opt"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
}

function choice(name: string, value: string, title: string, detail: string, checked: boolean): string {
  return `<label class="choice"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span class="choice-text"><span class="choice-title">${title}</span><span class="choice-detail">${detail}</span></span><span class="choice-mark" aria-hidden="true">${tokenSvg(1)}</span></label>`;
}

function nameField(p: 1 | 2, value: string, placeholder: string): string {
  const colour = p === 1 ? 'Vermilion' : 'Indigo';
  return `<label class="name-field p${p}">
    <span class="name-chip">${tokenSvg(p)}</span>
    <span class="name-label">${colour}</span>
    <input type="text" name="name${p}" maxlength="${NAME_MAX}" placeholder="${placeholder}" value="${escapeAttr(value)}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="${p === 1 ? 'next' : 'done'}">
  </label>`;
}

export function settingsPanel(settings: Settings, onChange: (s: Settings) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'settings';
  el.innerHTML = `
    ${toggle('sound', 'Sound', 'Wooden clicks as tiles are taken, a chime when a game ends.', settings.sound)}
    ${toggle('showPlayable', 'Lift the tiles you may take', 'Turn off to spot them yourself, as at the table.', settings.showPlayable)}
    ${toggle('reduceMotion', 'Reduce motion', 'No flying tiles or sweeping light. Your device setting is always respected.', settings.reduceMotion)}
    <section class="about">
      <h3>About</h3>
      <p>Paper Garden plays by the rules of a published abstract game, and is not affiliated with or endorsed by its designer or any publisher. A garden filled without a winner is a tie, as the designer ruled. Who opens after a tie is our choice (the other player than last time), since the rules name only the loser.</p>
      <p>The art, sounds and code are original. The typefaces are used under the SIL Open Font License: <a href="./licenses/ShipporiMinchoB1-OFL.txt" target="_blank" rel="noopener">Shippori Mincho B1</a> and <a href="./licenses/SourceSans3-OFL.txt" target="_blank" rel="noopener">Source Sans 3</a>.</p>
      <p>Your matches and settings are saved on this device only. Nothing is sent anywhere.</p>
    </section>`;
  el.addEventListener('change', () => {
    const on = (n: string) => (el.querySelector(`input[name="${n}"]`) as HTMLInputElement).checked;
    onChange({ sound: on('sound'), showPlayable: on('showPlayable'), reduceMotion: on('reduceMotion') });
  });
  return el;
}

function toggle(name: string, title: string, detail: string, on: boolean): string {
  return `<label class="toggle-row">
    <span class="toggle-text"><span class="toggle-title">${title}</span><span class="toggle-detail">${detail}</span></span>
    <input type="checkbox" role="switch" name="${name}"${on ? ' checked' : ''}>
    <span class="switch" aria-hidden="true">${tokenSvg(1)}</span>
  </label>`;
}

export interface MenuItem {
  id: string;
  label: string;
  icon: IconName;
  disabled?: boolean;
}

export function menuList(items: MenuItem[], onPick: (id: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'menu-list';
  el.innerHTML = items
    .map((it) => `<button type="button" class="menu-item" data-id="${it.id}"${it.disabled ? ' disabled' : ''}>${icon(it.icon)}<span>${it.label}</span></button>`)
    .join('');
  el.addEventListener('click', (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('[data-id]');
    if (b && !b.disabled) onPick(b.dataset.id!);
  });
  return el;
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

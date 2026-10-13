/** The app shell: switches between home and the game, and owns the sheets and saved state. */
import { restore, startMatch, type MatchSetup, type MatchView } from '../game/match';
import { installSprite } from './art';
import { GameScreen } from './game';
import { homeScreen } from './home';
import { menuList, settingsPanel, setupForm, startButton, type MenuItem } from './panels';
import { MATCH_KEY, loadSettings, loadSetup, saveSettings, saveSetup, type Settings } from './prefs';
import { rulesHtml } from './rules';
import { closeAllSheets, confirmSheet, openSheet, type Sheet } from './sheet';
import { setSoundEnabled, unlockAudio } from './sound';
import { loadRaw, saveRaw } from './storage';

export class App {
  private settings: Settings = loadSettings();
  private game: GameScreen | null = null;
  private current: HTMLElement | null = null;
  private sheet: Sheet | null = null;

  constructor(private readonly root: HTMLElement) {
    installSprite();
    this.applySettings();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('popstate', () => {
      if (this.game) this.showHome(false);
    });
    // The same match open in another tab: take up what that tab saved, rather than overwrite it
    // with this tab's older position on the next move.
    window.addEventListener('storage', (ev) => {
      if (ev.key !== MATCH_KEY) return;
      if (this.game) {
        const v = this.savedMatch();
        if (v) this.showGame(v);
        else this.showHome(false);
      } else if (!this.sheet) this.showHome(false);
    });
  }

  start(): void {
    this.showHome(false);
  }

  /* ---------- screens ---------- */

  private savedMatch(): MatchView | null {
    return restore(loadRaw(MATCH_KEY));
  }

  private mount(el: HTMLElement): void {
    this.current?.remove();
    this.current = el;
    this.root.append(el);
  }

  private showHome(fromGame: boolean): void {
    this.closeSheet();
    closeAllSheets();
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
    keepAwake(false);
    const el = homeScreen(this.savedMatch(), {
      continueMatch: () => this.continueMatch(),
      newMatch: () => this.openSetup(),
      rules: () => this.openRules(),
      settings: () => this.openSettings(),
    });
    this.mount(el);
    if (fromGame && history.state?.screen === 'game') history.back();
    // Back from a game: keyboard focus on the first action, not lost on the page.
    if (fromGame) el.querySelector<HTMLElement>('.home-actions .btn')?.focus({ preventScroll: true });
  }

  private showGame(view: MatchView): void {
    this.closeSheet();
    closeAllSheets();
    this.game?.destroy();
    this.game = new GameScreen(view, {
      settings: () => this.settings,
      save: (v) => saveRaw(MATCH_KEY, v.saved),
      openMenu: () => this.openMenu(),
      goHome: () => this.showHome(true),
      onChange: () => this.updateMenu(),
    });
    this.mount(this.game.el);
    if (history.state?.screen !== 'game') history.pushState({ screen: 'game' }, '');
    this.game.focusBoard();
    keepAwake(true);
  }

  private continueMatch(): void {
    const v = this.savedMatch();
    if (v) this.showGame(v);
    else this.showHome(false);
  }

  private startNew(setup: MatchSetup): void {
    saveSetup(setup);
    const view = startMatch(setup);
    saveRaw(MATCH_KEY, view.saved);
    this.showGame(view);
  }

  /* ---------- sheets ---------- */

  private closeSheet(): void {
    this.sheet?.close();
    this.sheet = null;
  }

  private open(title: string, body: Node | string, className?: string, footer?: Node): Sheet {
    this.closeSheet();
    const s = openSheet({
      title,
      body,
      className,
      footer,
      onClose: () => {
        if (this.sheet === s) this.sheet = null;
        // Moves made while the sheet was open were not heard (the game behind it was inert).
        this.game?.reannounce();
      },
    });
    this.sheet = s;
    return s;
  }

  private openSetup(): void {
    const saved = this.savedMatch();
    const form = setupForm(loadSetup(), async (setup) => {
      if (saved && !saved.match.over) {
        const ok = await confirmSheet('Start a new game?', 'The match in progress will be replaced.', 'Start new game');
        if (!ok) return;
      }
      this.startNew(setup);
    });
    this.open('New game', form, 'sheet-setup', startButton());
  }

  private openRules(): void {
    this.open('How to play', rulesHtml(), 'sheet-rules');
  }

  private openSettings(): void {
    this.open(
      'Settings',
      settingsPanel(this.settings, (s) => {
        this.settings = s;
        saveSettings(s);
        this.applySettings();
        this.game?.refresh();
      }),
      'sheet-settings',
    );
  }

  private openMenu(): void {
    const g = this.game;
    if (!g) return;
    const items: MenuItem[] = [
      { id: 'resume', label: 'Back to the game', icon: 'play' },
      ...(g.hasUndo ? [{ id: 'undo', label: 'Undo', icon: 'undo', disabled: !g.canUndo } as MenuItem] : []),
      { id: 'rules', label: 'How to play', icon: 'book' },
      { id: 'settings', label: 'Settings', icon: 'sliders' },
      { id: 'restart', label: 'Restart the match', icon: 'restart' },
      { id: 'home', label: 'Home', icon: 'home' },
    ];
    const list = menuList(items, async (id) => {
      if (id === 'resume') return this.closeSheet();
      if (id === 'undo') {
        if (!g.canUndo) return;
        this.closeSheet();
        return g.undo();
      }
      if (id === 'rules') return this.openRules();
      if (id === 'settings') return this.openSettings();
      if (id === 'home') return this.showHome(true);
      if (id === 'restart') {
        this.closeSheet();
        const ok = await confirmSheet('Restart the match?', 'Scores go back to zero and a new garden is laid out.', 'Restart');
        if (ok) g.again();
      }
    });
    this.open('Menu', list, 'sheet-menu');
  }

  /** The menu's Undo follows the game while the menu is open (a flight landing, the computer's reply). */
  private updateMenu(): void {
    const undoItem = this.sheet?.dialog.querySelector<HTMLButtonElement>('.menu-item[data-id="undo"]');
    if (undoItem && this.game) undoItem.disabled = !this.game.canUndo;
  }

  private applySettings(): void {
    setSoundEnabled(this.settings.sound);
    document.documentElement.classList.toggle('reduce-motion', this.settings.reduceMotion);
  }
}

/* While a game is on screen, keep the display awake: players may think for a while, and a dimmed
   tablet in the middle of a two-player game is the worst moment to ask for a tap. */
let wakeWanted = false;
let wakeLock: { release(): Promise<void> } | null = null;

function keepAwake(on: boolean): void {
  wakeWanted = on;
  if (on) void acquire();
  else {
    void wakeLock?.release().catch(() => undefined);
    wakeLock = null;
  }
}

async function acquire(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
  if (!nav.wakeLock || wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await nav.wakeLock.request('screen');
  } catch {
    wakeLock = null; // not allowed (battery saver, iframe, older browser): the game is unaffected
  }
}

// The browser releases the lock when the page is hidden; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeWanted) {
    wakeLock = null;
    void acquire();
  }
});

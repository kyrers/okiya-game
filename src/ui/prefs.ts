/** Player preferences and the last match setup, kept in the browser. */
import { isDifficulty } from '../engine/ai';
import { isMatchMode } from '../engine/okiya';
import { defaultNames, NAME_MAX, type MatchSetup } from '../game/match';
import { loadRaw, saveRaw } from './storage';

export interface Settings {
  sound: boolean;
  /** Lift the tiles that may be taken. */
  showPlayable: boolean;
  /** Reduce motion even when the system does not ask for it. */
  reduceMotion: boolean;
}

const SETTINGS_KEY = 'okiya.settings.v1';
const SETUP_KEY = 'okiya.setup.v1';
export const MATCH_KEY = 'okiya.match.v1';

export const DEFAULT_SETTINGS: Settings = { sound: true, showPlayable: true, reduceMotion: false };

export function loadSettings(): Settings {
  const raw = loadRaw(SETTINGS_KEY);
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (typeof r.sound === 'boolean') s.sound = r.sound;
    if (typeof r.showPlayable === 'boolean') s.showPlayable = r.showPlayable;
    if (typeof r.reduceMotion === 'boolean') s.reduceMotion = r.reduceMotion;
  }
  return s;
}

export function saveSettings(s: Settings): void {
  saveRaw(SETTINGS_KEY, s);
}

export const DEFAULT_SETUP: MatchSetup = { opponent: 'computer', difficulty: 'medium', mode: 'single', names: defaultNames('human') };

export function loadSetup(): MatchSetup {
  const raw = loadRaw(SETUP_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_SETUP;
  const r = raw as Record<string, unknown>;
  const names = Array.isArray(r.names) && r.names.length === 2 ? r.names.map((n) => (typeof n === 'string' ? n.slice(0, NAME_MAX) : '')) : DEFAULT_SETUP.names;
  return {
    opponent: r.opponent === 'human' || r.opponent === 'computer' ? r.opponent : DEFAULT_SETUP.opponent,
    difficulty: isDifficulty(r.difficulty) ? r.difficulty : DEFAULT_SETUP.difficulty,
    mode: isMatchMode(r.mode) ? r.mode : DEFAULT_SETUP.mode,
    names: [String(names[0]), String(names[1])],
  };
}

export function saveSetup(s: MatchSetup): void {
  saveRaw(SETUP_KEY, s);
}

export function motionReduced(settings: Settings): boolean {
  return settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

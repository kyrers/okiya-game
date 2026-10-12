/** Every sentence the game says about tiles, turns and results, in one place. */
import type { Difficulty } from '../engine/ai';
import type { EndReason, MatchMode, Symbol, Tile, Vegetation } from '../engine/okiya';
import { symGlyph, vegGlyph } from './tileArt';

export const VEG_WORD: Record<Vegetation, string> = { maple: 'maple', cherry: 'cherry', pine: 'pine', iris: 'iris' };
export const SYM_WORD: Record<Symbol, string> = { sun: 'rising sun', poem: 'poem', bird: 'bird', rain: 'rain' };

export const DIFFICULTY_WORD: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const MODE_WORD: Record<MatchMode, string> = {
  single: 'Single game',
  sets3: 'First to 3 wins',
  points10: 'First to 10 points',
  points15: 'First to 15 points',
  points20: 'First to 20 points',
};

export const MODE_DETAIL: Record<MatchMode, string> = {
  single: 'One game decides it.',
  sets3: 'Play on until someone has won three games.',
  points10: 'A win scores the tiles still in the garden.',
  points15: 'A win scores the tiles still in the garden.',
  points20: 'A win scores the tiles still in the garden.',
};

/** "Take a cherry or bird tile", with the two glyphs, as HTML. */
export function orderHtml(t: Tile): string {
  return `Take a <span class="w">${vegGlyph(t.veg)}${VEG_WORD[t.veg]}</span> or <span class="w">${symGlyph(t.sym)}${SYM_WORD[t.sym]}</span> tile`;
}

export function orderText(t: Tile): string {
  return `take a ${VEG_WORD[t.veg]} or ${SYM_WORD[t.sym]} tile`;
}

export function tileWords(t: Tile): string {
  return `${VEG_WORD[t.veg]} and ${SYM_WORD[t.sym]}`;
}

/** Names are "You" for the person playing the computer; grammar follows. */
export function possessive(name: string): string {
  return name === 'You' ? 'Your' : `${name}’s`;
}

export function verb(name: string, you: string, other: string): string {
  return name === 'You' ? you : other;
}

export function reasonWords(reason: EndReason, loser: string): string {
  switch (reason) {
    case 'row': return 'Four in a row';
    case 'column': return 'Four in a column';
    case 'diagonal': return 'Four on a diagonal';
    case 'square': return 'A square of four';
    case 'blocked': return loser === 'You' ? 'You have no tile you may take' : `${loser} has no tile to take`;
    case 'full': return 'The garden is full';
  }
}

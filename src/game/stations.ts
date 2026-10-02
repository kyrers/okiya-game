/** The Flower Road: six stations, each a rival and a petal target over three lanterns (games). */
import type { AiOptions } from '../engine/ai';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export interface Station {
  index: number;
  season: Season;
  /** Place name shown on the road. */
  place: string;
  rival: { name: string; title: string; line: string };
  ai: AiOptions;
  /** Petals to gather within the lanterns. */
  target: number;
  /** Games available at this station. */
  lanterns: number;
}

export const STATIONS: readonly Station[] = [
  {
    index: 0, season: 'Spring', place: 'Plum Gate',
    rival: { name: 'Haru', title: 'the Eager', line: 'She reaches for every line she sees.' },
    ai: { depth: 1, blunder: 0.35 }, target: 30, lanterns: 3,
  },
  {
    index: 1, season: 'Spring', place: 'Willow Bridge',
    rival: { name: 'Ume', title: 'the Gentle', line: 'Kind, careless, and quicker than she looks.' },
    ai: { depth: 1, blunder: 0.15 }, target: 33, lanterns: 3,
  },
  {
    index: 2, season: 'Summer', place: 'Cicada Teahouse',
    rival: { name: 'Natsu', title: 'the Mirror', line: 'She answers your shape with her own.' },
    ai: { depth: 2, blunder: 0.15 }, target: 16, lanterns: 3,
  },
  {
    index: 3, season: 'Summer', place: 'Firefly Pond',
    rival: { name: 'Kaede', title: 'the Patient', line: 'She waits for you to run out of tiles.' },
    ai: { depth: 2, blunder: 0.05 }, target: 12, lanterns: 3,
  },
  {
    index: 4, season: 'Autumn', place: 'Maple Steps',
    rival: { name: 'Aki', title: 'the Wall', line: 'Every tile you want, she has already closed.' },
    ai: { depth: 3, blunder: 0.05 }, target: 12, lanterns: 3,
  },
  {
    index: 5, season: 'Winter', place: 'Snow Pavilion',
    rival: { name: 'Okasan', title: 'the Matron', line: 'The house itself sits down to play.' },
    ai: { depth: 4, blunder: 0.03 }, target: 8, lanterns: 3,
  },
];

export const MAX_HELD = 4;
export const DRAFT_SIZE = 3;

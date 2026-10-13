/// <reference lib="webworker" />
/** Runs the computer player's search off the main thread. */
import { DIFFICULTY, Searcher, chooseMove } from '../engine/ai';
import { mulberry32 } from '../engine/garden';
import type { AiRequest, AiResponse } from './aiClient';

const searcher = new Searcher();

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, state, difficulty, seed } = e.data;
  const r = chooseMove(state, { ...DIFFICULTY[difficulty], rng: mulberry32(seed) }, searcher);
  const reply: AiResponse = { id, index: r.index };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
};

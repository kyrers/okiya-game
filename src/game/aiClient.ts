/**
 * Asks the computer player for a move. The search runs in a Web Worker so the board stays
 * responsive; if workers are unavailable it runs on the main thread instead.
 */
import { DIFFICULTY, Searcher, chooseMove, type Difficulty } from '../engine/ai';
import { mulberry32, type GameState } from '../engine/garden';

export interface AiRequest {
  id: number;
  state: GameState;
  difficulty: Difficulty;
  seed: number;
}

export interface AiResponse {
  id: number;
  index: number;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, (index: number) => void>();
let fallbackSearcher: Searcher | null = null;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AiResponse>) => {
      const resolve = pending.get(e.data.id);
      pending.delete(e.data.id);
      resolve?.(e.data.index);
    };
    worker.onerror = () => {
      // Answer everything still waiting on the main thread, and stop using the worker.
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [id, resolve] of pending) {
        const req = requests.get(id);
        if (req) resolve(localMove(req));
      }
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

const requests = new Map<number, AiRequest>();

function localMove(req: AiRequest): number {
  fallbackSearcher ??= new Searcher();
  return chooseMove(req.state, { ...DIFFICULTY[req.difficulty], rng: mulberry32(req.seed) }, fallbackSearcher).index;
}

/** Resolve with the board index the computer takes. */
export function computerMove(state: GameState, difficulty: Difficulty): Promise<number> {
  const req: AiRequest = { id: nextId++, state, difficulty, seed: Math.floor(Math.random() * 2 ** 32) };
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => localMove(req));
  return new Promise((resolve) => {
    requests.set(req.id, req);
    pending.set(req.id, (index) => {
      requests.delete(req.id);
      resolve(index);
    });
    w.postMessage(req);
  });
}

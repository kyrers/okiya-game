/**
 * Game sounds, synthesised at run time with the Web Audio API (no audio files, nothing licensed).
 * They are voiced as a game of flower cards played on tatami, as the tiles' motifs are hanafuda's:
 * a move is a card snapped down onto the mat, a refused tap a finger's knock on wood, and the end
 * of a game a small struck bell (a rin).
 * The audio context is created on the first user gesture, as browsers require. While sound is off
 * nothing is built; every node lets go of the graph as soon as its sound has finished.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** Call from a user gesture (pointerdown/keydown) so the context may start, notably on iOS. */
export function unlockAudio(): void {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready(): { c: AudioContext; out: GainNode } | null {
  if (!enabled || !ctx || !master || ctx.state !== 'running') return null;
  return { c: ctx, out: master };
}

let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 0.4);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  noiseBuffer = buf;
  return buf;
}

/**
 * A struck envelope: up to `peak` in `attack`, then an exponential fall of 50 dB over `decay`
 * (a natural ring, not a fade), then to silence in a few milliseconds. Returns the end time.
 */
function strike(g: GainNode, t: number, peak: number, attack: number, decay: number): number {
  const p = g.gain;
  // Silent until the strike: a source may sound a fraction of a sample before its start time.
  p.value = 0;
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(peak * 0.003, t + attack + decay);
  p.linearRampToValueAtTime(0, t + attack + decay + 0.02);
  return t + attack + decay + 0.025;
}

/** Disconnect a sound's nodes once its source has stopped. */
function release(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    src.disconnect();
    for (const n of nodes) n.disconnect();
  };
}

/** One resonance: a sine at `freq`, optionally sinking a little in pitch as it rings. */
function tone(c: AudioContext, out: AudioNode, t: number, freq: number, peak: number, decay: number, attack = 0.0015, sinkTo?: number): void {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(freq, t);
  if (sinkTo) o.frequency.exponentialRampToValueAtTime(sinkTo, t + decay);
  const g = c.createGain();
  const end = strike(g, t, peak, attack, decay);
  o.connect(g).connect(out);
  release(o, g);
  o.start(t);
  o.stop(end);
}

/** A burst of filtered noise: the contact itself (a card on the mat, a finger, a striker). */
function burst(c: AudioContext, out: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number): void {
  const n = c.createBufferSource();
  n.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const end = strike(g, t, peak, 0.0008, decay);
  n.connect(f).connect(g).connect(out);
  release(n, f, g);
  // A different stretch of the noise each time, so no two contacts are quite alike.
  n.start(t, Math.random() * 0.3);
  n.stop(end);
}

/** Air pushed ahead of a falling card: band-passed noise swelling until it lands at `t + dur`. */
function swish(c: AudioContext, out: AudioNode, t: number, dur: number, freq: number, q: number, peak: number): void {
  const n = c.createBufferSource();
  n.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq * 0.7, t);
  f.frequency.exponentialRampToValueAtTime(freq, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  const p = g.gain;
  p.value = 0;
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(peak, t + dur);
  p.linearRampToValueAtTime(0, t + dur + 0.006);
  n.connect(f).connect(g).connect(out);
  release(n, f, g);
  n.start(t, Math.random() * 0.3);
  n.stop(t + dur + 0.01);
}

/** A small random spread (±2%), as no two cards land quite alike. */
const vary = (): number => 1 + (Math.random() - 0.5) * 0.04;

/** How long the card is heard falling before it lands, so a caller can time the landing. */
export const PLACE_LEAD_MS = 22;

/** A move: a thick hanafuda card snapped down onto tatami, "pachi", landing PLACE_LEAD_MS after the call. */
export function soundPlace(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  const v = vary();
  const hit = t + PLACE_LEAD_MS / 1000;
  swish(c, out, t, PLACE_LEAD_MS / 1000, 3200 * v, 0.8, 0.05);
  // The snap: the card meeting the mat and the air pressed out from under it, and its edge.
  burst(c, out, hit, 'bandpass', 2300 * v, 0.8, 1.4, 0.008);
  burst(c, out, hit, 'highpass', 4200, 0.7, 0.14, 0.004);
  // The stiff card's flex, damped at once.
  tone(c, out, hit, 1350 * v, 0.15, 0.014);
  // The tatami giving under it, and its woven rush answering faintly.
  burst(c, out, hit, 'lowpass', 520, 0.7, 0.75, 0.03);
  burst(c, out, hit + 0.002, 'bandpass', 5200, 1.5, 0.06, 0.02);
  tone(c, out, hit, 170 * v, 0.08, 0.04, 0.003);
}

/** A tap on something that cannot be taken: a soft, muted knock, like a finger on wood. */
export function soundDenied(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  burst(c, out, t, 'lowpass', 750, 0.7, 0.35, 0.014);
  tone(c, out, t, 155, 0.17, 0.09, 0.003, 120);
  tone(c, out, t, 360, 0.05, 0.04, 0.003);
}

/**
 * The partials of a small rin (a struck bowl bell): inharmonic, each one fainter and shorter than
 * the one below. As [ratio to the fundamental, level, share of the ring].
 */
const RIN: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [2.71, 0.42, 0.55],
  [5.36, 0.17, 0.32],
  [8.86, 0.07, 0.18],
];

/** One strike of the rin. `bright` scales the upper partials and the striker's tap. */
function rin(c: AudioContext, out: AudioNode, t: number, freq: number, peak: number, ring: number, bright: number): void {
  burst(c, out, t, 'bandpass', Math.min(freq * 4.5, 6000), 1.2, peak * 0.9 * bright, 0.008);
  for (const [ratio, level, share] of RIN) {
    const p = peak * level * (ratio > 1 ? bright : 1);
    // Each partial as a slightly split pair, as in a real bowl: their slow beat is the rin's shimmer.
    tone(c, out, t, freq * ratio, p * 0.6, ring * share, 0.002);
    tone(c, out, t, freq * ratio * 1.0028, p * 0.4, ring * share, 0.002);
  }
}

/** The end of a game: two rising strikes of the bell for a win, one lower and softer for a loss, one level for a tie. */
export function soundEnd(kind: 'win' | 'loss' | 'tie'): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.02;
  if (kind === 'win') {
    rin(c, out, t, 659.25, 0.16, 1.15, 0.85);
    rin(c, out, t + 0.2, 880, 0.22, 1.25, 1);
  } else if (kind === 'loss') {
    rin(c, out, t, 493.88, 0.17, 1.45, 0.55);
  } else {
    rin(c, out, t, 659.25, 0.18, 1.45, 0.8);
  }
}

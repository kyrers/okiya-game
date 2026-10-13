/**
 * Game sounds, synthesised at run time with the Web Audio API (no audio files, nothing licensed).
 * They are voiced as a game played on a wooden board: a token set down like a go stone on a
 * goban, a tile lifted as a light paper-and-wood tick, a refused tap as a finger's knock on wood,
 * and the end of a game as a small struck bell (a rin).
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

/** A burst of filtered noise: the contact itself (stone on wood, a finger, a striker). */
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

/** A small random spread (±2%), as no two stones land quite alike. */
const vary = (): number => 1 + (Math.random() - 0.5) * 0.04;

/** A token set down on the board: "pachi", a go stone on a wooden goban. */
export function soundPlace(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  const v = vary();
  // The crack of stone on wood: very short and bright.
  burst(c, out, t, 'bandpass', 4300 * v, 0.9, 0.48, 0.012);
  // The stone's own brief ring.
  tone(c, out, t, 3150 * v, 0.05, 0.022);
  // The board answering: two dry wood modes and a small, low body under them.
  tone(c, out, t, 840 * v, 0.24, 0.05);
  tone(c, out, t, 1570 * v, 0.08, 0.03);
  tone(c, out, t, 210 * v, 0.2, 0.075, 0.003, 185 * v);
}

/** A tile lifted out of the garden: a light paper-and-wood tick, done before the token lands. */
export function soundLift(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  const v = vary();
  burst(c, out, t, 'bandpass', 3000 * v, 1.2, 0.22, 0.014);
  // The paper's whisper as it leaves its neighbours.
  burst(c, out, t + 0.004, 'highpass', 5200, 0.7, 0.05, 0.045);
  tone(c, out, t, 1180 * v, 0.06, 0.025);
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

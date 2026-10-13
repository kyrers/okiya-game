/**
 * Game sounds, synthesised at run time with the Web Audio API (no audio files, nothing licensed).
 * The audio context is created on the first user gesture, as browsers require.
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

function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** A wooden token set down on the board. */
export function soundPlace(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  // Knock: a short, pitched body.
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  const og = c.createGain();
  envelope(og, t, 0.5, 0.004, 0.14);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.2);
  // Click: the contact, as band-passed noise.
  const n = c.createBufferSource();
  n.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 1.4;
  const ng = c.createGain();
  envelope(ng, t, 0.35, 0.002, 0.045);
  n.connect(bp).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.08);
}

/** A tile lifted out of the garden: a soft paper slide. */
export function soundLift(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  const n = c.createBufferSource();
  n.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(3200, t + 0.16);
  const g = c.createGain();
  envelope(g, t, 0.12, 0.03, 0.15);
  n.connect(f).connect(g).connect(out);
  n.start(t);
  n.stop(t + 0.22);
}

function bell(c: AudioContext, out: GainNode, freq: number, t: number, peak: number, decay: number): void {
  for (const [mult, amp] of [[1, 1], [2.01, 0.28], [3.98, 0.08]] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const g = c.createGain();
    envelope(g, t, peak * amp, 0.006, decay / mult);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/** The end of a game: a rising phrase for a win, a falling one for a loss, level for a tie. */
export function soundEnd(kind: 'win' | 'loss' | 'tie'): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.02;
  // D minor pentatonic, which suits the paper-and-wood world without quoting any real melody.
  const notes = kind === 'win' ? [587.33, 698.46, 880, 1174.66] : kind === 'loss' ? [698.46, 587.33, 440] : [587.33, 587.33];
  notes.forEach((f, i) => bell(c, out, f, t + i * 0.13, kind === 'win' ? 0.22 : 0.16, 1.4));
}

/** A tap on something that cannot be taken. */
export function soundDenied(): void {
  const a = ready();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + 0.005;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.1);
  const g = c.createGain();
  envelope(g, t, 0.18, 0.004, 0.1);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.15);
}

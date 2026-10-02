/**
 * Inline SVG art for the 16 garden tiles: a vegetation motif in the lower
 * part of the tile and a symbol motif in the upper part. Pure functions that
 * return SVG markup strings; colours come from CSS custom properties so the
 * palette can be themed.
 */
import type { Symbol, Tile, Vegetation } from '../engine/okiya';

export const VEG_LABEL: Record<Vegetation, string> = { maple: 'Maple', cherry: 'Cherry', pine: 'Pine', iris: 'Iris' };
export const SYM_LABEL: Record<Symbol, string> = { sun: 'Rising sun', poem: 'Poem', bird: 'Bird', rain: 'Rain' };

export function tileLabel(t: Tile): string {
  return `${VEG_LABEL[t.veg]} · ${SYM_LABEL[t.sym]}`;
}

/* ---- vegetation motifs (drawn in a 100x100 viewBox, anchored to the bottom) ---- */

function maple(): string {
  // Three maple leaves (five-pointed stars with stems).
  const leaf = (x: number, y: number, s: number, rot: number) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" class="veg veg-maple">
      <path d="M0,-16 L4,-6 L15,-8 L8,0 L13,10 L2,6 L0,16 L-2,6 L-13,10 L-8,0 L-15,-8 L-4,-6 Z"/>
      <line x1="0" y1="2" x2="0" y2="22" class="stem"/>
    </g>`;
  return leaf(28, 70, 1.0, -20) + leaf(58, 78, 1.25, 15) + leaf(80, 60, 0.8, 40);
}

function cherry(): string {
  // A dark branch with blossoms.
  const blossom = (x: number, y: number, r: number) =>
    `<g transform="translate(${x} ${y})" class="veg veg-cherry">
      ${[0, 72, 144, 216, 288].map((a) => `<circle cx="${(r * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(r * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="${(r * 0.72).toFixed(1)}"/>`).join('')}
      <circle cx="0" cy="0" r="${(r * 0.45).toFixed(1)}" class="pistil"/>
    </g>`;
  return `<path d="M-2,92 C20,80 30,70 48,66 S80,60 104,44" class="branch"/>
    <path d="M48,66 C52,58 56,54 64,50" class="branch thin"/>
    ${blossom(30, 72, 4.2)}${blossom(52, 60, 5)}${blossom(70, 58, 3.8)}${blossom(88, 50, 4.4)}${blossom(40, 80, 3.2)}`;
}

function pine(): string {
  // A cluster of stylised pine needles (fans).
  const fan = (x: number, y: number, s: number, rot: number) => {
    const needles = [];
    for (let a = -60; a <= 60; a += 15) {
      needles.push(`<line x1="0" y1="0" x2="${(28 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" y2="${(-28 * Math.cos((a * Math.PI) / 180)).toFixed(1)}"/>`);
    }
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" class="veg veg-pine">${needles.join('')}</g>`;
  };
  return fan(28, 92, 1, -15) + fan(58, 96, 1.2, 5) + fan(84, 92, 0.9, 25);
}

function iris(): string {
  // Iris flower with long leaves.
  return `<g class="veg veg-iris">
    <path d="M30,98 C34,70 40,56 46,40" class="leaf"/>
    <path d="M78,98 C72,74 68,60 60,46" class="leaf"/>
    <path d="M54,98 C54,78 54,66 54,50" class="leaf"/>
    <g transform="translate(54 42)">
      <path d="M0,0 C-6,-6 -12,-14 -4,-22 C0,-16 2,-12 0,0 Z" class="petal"/>
      <path d="M0,0 C6,-6 12,-14 4,-22 C0,-16 -2,-12 0,0 Z" class="petal"/>
      <path d="M0,0 C-10,2 -18,0 -16,10 C-10,8 -4,4 0,0 Z" class="petal"/>
      <path d="M0,0 C10,2 18,0 16,10 C10,8 4,4 0,0 Z" class="petal"/>
      <path d="M0,0 C-2,6 -2,12 0,16 C2,12 2,6 0,0 Z" class="petal"/>
    </g>
  </g>`;
}

/* ---- symbol motifs (upper part) ---- */

function sun(): string {
  return `<circle cx="50" cy="38" r="24" class="sym sym-sun"/>`;
}

function poem(): string {
  // A tanzaku (hanging poem strip) with a small hole and strokes of calligraphy.
  return `<g class="sym sym-poem" transform="translate(50 36) rotate(6)">
    <rect x="-12" y="-30" width="24" height="60" rx="2"/>
    <circle cx="0" cy="-24" r="1.8" class="hole"/>
    <line x1="0" y1="-14" x2="0" y2="-4" class="ink"/>
    <line x1="0" y1="0" x2="0" y2="12" class="ink"/>
    <line x1="0" y1="16" x2="0" y2="22" class="ink"/>
  </g>`;
}

function bird(): string {
  // A swallow-like silhouette.
  return `<g class="sym sym-bird" transform="translate(52 36)">
    <path d="M-30,-2 C-18,-14 -6,-14 2,-8 C8,-16 18,-18 30,-14 C20,-10 14,-4 12,2 C16,8 22,14 30,16 C18,16 10,12 4,6 C-2,12 -12,16 -24,12 C-14,10 -8,6 -4,0 C-12,-6 -22,-6 -30,-2 Z"/>
    <path d="M12,2 L28,8" class="tail"/>
  </g>`;
}

function rain(): string {
  // A cloud band with falling rain strokes.
  const drops = [];
  for (let i = 0; i < 7; i++) {
    const x = 18 + i * 10;
    drops.push(`<line x1="${x}" y1="42" x2="${x - 4}" y2="${56 + (i % 2) * 6}" class="drop"/>`);
  }
  return `<g class="sym sym-rain">
    <path d="M8,30 C8,16 26,12 32,22 C36,8 58,8 62,20 C72,14 92,20 90,32 L90,36 L8,36 Z" class="cloud"/>
    ${drops.join('')}
  </g>`;
}

const VEG_ART: Record<Vegetation, () => string> = { maple, cherry, pine, iris };
const SYM_ART: Record<Symbol, () => string> = { sun, poem, bird, rain };

/** Full tile SVG (100x100 viewBox). */
export function tileSvg(t: Tile): string {
  return `<svg viewBox="0 0 100 100" class="tile-art tile-${t.veg} tile-${t.sym}" aria-hidden="true" focusable="false">
    ${SYM_ART[t.sym]()}
    ${VEG_ART[t.veg]()}
  </svg>`;
}

/** Small glyph of a single vegetation or symbol, used in the constraint legend. */
export function vegGlyph(v: Vegetation): string {
  return `<svg viewBox="0 0 100 100" class="glyph glyph-${v}" aria-hidden="true"><g transform="translate(0 -30)">${VEG_ART[v]()}</g></svg>`;
}
export function symGlyph(s: Symbol): string {
  return `<svg viewBox="0 0 100 100" class="glyph glyph-${s}" aria-hidden="true"><g transform="translate(0 14)">${SYM_ART[s]()}</g></svg>`;
}

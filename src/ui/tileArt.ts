/**
 * Inline SVG art for the 16 garden tiles: a vegetation motif in the lower
 * part of the tile and a symbol motif in the upper part. Pure functions that
 * return SVG markup strings; colours come from CSS custom properties so the
 * palette can be themed.
 */
import { SYMBOLS, VEGETATIONS, type Symbol, type Tile, type Vegetation } from '../engine/okiya';

export const VEG_LABEL: Record<Vegetation, string> = { maple: 'Maple', cherry: 'Cherry', pine: 'Pine', iris: 'Iris' };
export const SYM_LABEL: Record<Symbol, string> = { sun: 'Rising sun', poem: 'Poem', bird: 'Bird', rain: 'Rain' };

export function tileLabel(t: Tile): string {
  return `${VEG_LABEL[t.veg]} · ${SYM_LABEL[t.sym]}`;
}

/* ---- vegetation motifs (drawn in a 100x100 viewBox, anchored to the bottom) ---- */

function maple(): string {
  // Three five-lobed maple leaves with stems.
  const leaf = (x: number, y: number, sc: number, rot: number) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})" class="veg veg-maple">
      <path d="M0,-18 C1,-13 3,-10 4,-8 L13,-13 C11,-8 10,-5 9,-2 L17,3 C12,4 9,5 7,6 L10,15 C6,12 3,10 1,8 L0,10 L-1,8 C-3,10 -6,12 -10,15 L-7,6 C-9,5 -12,4 -17,3 L-9,-2 C-10,-5 -11,-8 -13,-13 L-4,-8 C-3,-10 -1,-13 0,-18 Z"/>
      <line x1="0" y1="8" x2="0" y2="22" class="stem"/>
    </g>`;
  return leaf(26, 68, 0.95, -18) + leaf(58, 76, 1.2, 12) + leaf(82, 60, 0.75, 38);
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
  // A Japanese umbrella pine: a bent trunk with three layered, flat-topped canopies.
  return `<g class="veg veg-pine">
    <path d="M52,100 C54,88 50,80 56,70 C60,62 58,56 62,48" class="trunk"/>
    <path d="M40,76 C44,66 72,64 80,72 C84,76 80,80 72,80 L44,80 C38,80 36,78 40,76 Z" class="canopy"/>
    <path d="M26,86 C30,76 58,74 66,82 C70,86 66,90 58,90 L30,90 C24,90 22,88 26,86 Z" class="canopy"/>
    <path d="M50,58 C54,48 78,46 86,54 C90,58 86,62 78,62 L54,62 C48,62 46,60 50,58 Z" class="canopy"/>
    <path d="M44,78 l-3,-6 M54,78 l0,-7 M64,78 l3,-6 M30,88 l-3,-6 M40,88 l0,-7 M50,88 l3,-6 M54,60 l-3,-6 M64,60 l0,-7 M74,60 l3,-6" class="needles"/>
  </g>`;
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
  // A brush-edged cloud band with slanted rain strokes.
  const drops = [];
  for (let i = 0; i < 7; i++) {
    const x = 18 + i * 10;
    drops.push(`<line x1="${x}" y1="42" x2="${x - 4}" y2="${56 + (i % 2) * 6}" class="drop"/>`);
  }
  return `<g class="sym sym-rain">
    <path d="M8,32 C6,22 16,14 26,18 C30,8 48,6 56,16 C64,10 82,12 86,24 C94,26 94,36 86,38 L14,38 C8,38 6,36 8,32 Z" class="cloud"/>
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

/** Small inline blossom used as the petal unit. */
export function petalIcon(): string {
  return `<svg viewBox="0 0 24 24" class="petal-icon" aria-hidden="true"><g fill="currentColor">${[0, 72, 144, 216, 288]
    .map((a) => `<circle cx="${(12 + 6 * Math.cos((a * Math.PI) / 180)).toFixed(2)}" cy="${(12 + 6 * Math.sin((a * Math.PI) / 180)).toFixed(2)}" r="4.4"/>`)
    .join('')}</g><circle cx="12" cy="12" r="2.6" fill="#fff3cf"/></svg>`;
}

/** 4x4 key of every tile: rows are vegetations, columns are symbols. */
export function gardenKeyHtml(): string {
  const cols = SYMBOLS.map((sy) => `<div class="key-head">${symGlyph(sy)}<span>${SYM_LABEL[sy]}</span></div>`).join('');
  const rows = VEGETATIONS.map(
    (v) => `<div class="key-head">${vegGlyph(v)}<span>${VEG_LABEL[v]}</span></div>` + SYMBOLS.map((sy) => `<div class="key-tile" title="${VEG_LABEL[v]} · ${SYM_LABEL[sy]}">${tileSvg({ veg: v, sym: sy })}</div>`).join(''),
  ).join('');
  return `<div class="garden-key" aria-label="The 16 garden tiles"><div></div>${cols}${rows}</div>`;
}

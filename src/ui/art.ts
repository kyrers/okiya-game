/**
 * Original SVG art besides the garden tiles: the two players' tokens, the interface icons and the
 * small diagrams used by the rules. Tokens live in one hidden sprite so every cell can reference
 * them with <use> instead of repeating the markup.
 */
import type { Player } from '../engine/garden';

const PETAL = 'M50,50 C41,43 38,31 44,23 L50,28 L56,23 C62,31 59,43 50,50 Z';

/** Player 1's tokens carry a five-petal crest; player 2's are plain, as in the printed game. */
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
  <defs>
    <radialGradient id="lacquer-1" cx="36%" cy="30%" r="78%">
      <stop offset="0" stop-color="#ea7558"/><stop offset=".5" stop-color="#c63d24"/><stop offset="1" stop-color="#8a2615"/>
    </radialGradient>
    <radialGradient id="lacquer-2" cx="36%" cy="30%" r="78%">
      <stop offset="0" stop-color="#6375b8"/><stop offset=".5" stop-color="#2e3d78"/><stop offset="1" stop-color="#171f45"/>
    </radialGradient>
  </defs>
  <symbol id="token-1" viewBox="0 0 100 100">
    <ellipse cx="50" cy="57" rx="42" ry="39" fill="#1b0f08" opacity=".32"/>
    <circle cx="50" cy="50" r="42" fill="url(#lacquer-1)"/>
    <circle cx="50" cy="50" r="41.2" fill="none" stroke="#5c1a0e" stroke-opacity=".55" stroke-width="1.6"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="#fbe9cf" stroke-opacity=".55" stroke-width="2"/>
    <g fill="#fbe9cf" fill-opacity=".93">
      ${[0, 72, 144, 216, 288].map((a) => `<path d="${PETAL}" transform="rotate(${a} 50 50)"/>`).join('')}
    </g>
    <circle cx="50" cy="50" r="4.2" fill="#c63d24"/>
    <path d="M23,36 A30,30 0 0 1 44,19" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3.2" stroke-linecap="round"/>
  </symbol>
  <symbol id="token-2" viewBox="0 0 100 100">
    <ellipse cx="50" cy="57" rx="42" ry="39" fill="#0b0d1c" opacity=".34"/>
    <circle cx="50" cy="50" r="42" fill="url(#lacquer-2)"/>
    <circle cx="50" cy="50" r="41.2" fill="none" stroke="#0d1230" stroke-opacity=".6" stroke-width="1.6"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="#dfe4f6" stroke-opacity=".32" stroke-width="2"/>
    <path d="M23,36 A30,30 0 0 1 44,19" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="3.2" stroke-linecap="round"/>
  </symbol>
</svg>`;

export function installSprite(): void {
  if (document.getElementById('token-1')) return;
  document.body.insertAdjacentHTML('afterbegin', SPRITE);
}

export function tokenSvg(p: Player, extraClass = ''): string {
  return `<svg class="token-svg ${extraClass}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#token-${p}"/></svg>`;
}

/* ---------- icons: 24px grid, 1.8 stroke, round caps and joins ---------- */

const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6.5 9.5V19h11V9.5"/><path d="M10 19v-5h4v5"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  /** A game to watch: the play mark inside a ring, so it is not taken for Continue or New game. */
  watch: '<circle cx="12" cy="12" r="8.6"/><path d="M10.2 8.6v6.8l5.3-3.4z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  next: '<path d="M6 6v12l8.5-6z"/><path d="M18 6v12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, extraClass = ''): string {
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/** The opening order's picture: a 4x4 garden whose outer ring is gold, the middle four open. */
export function ringDiagram(): string {
  const cells = Array.from({ length: 16 }, (_, i) => {
    const r = Math.floor(i / 4);
    const c = i % 4;
    const ring = r === 0 || r === 3 || c === 0 || c === 3;
    return `<rect x="${3 + c * 11}" y="${3 + r * 11}" width="9" height="9" rx="2" class="${ring ? 'ring-on' : 'ring-off'}"/>`;
  }).join('');
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${cells}</svg>`;
}

/* ---------- rules diagrams: a 4x4 garden in miniature ---------- */

export type MiniCell = '.' | '1' | '2' | 'o' | 'x' | '*';

/**
 * A small schematic garden. Cells: '.' tile, '1'/'2' tokens, 'o' a tile that may be taken,
 * 'x' a tile that may not be taken, '*' the tile being taken.
 * `stroke` draws a brush line through the given cells (a winning formation).
 */
export function miniGarden(cells: string, label: string, stroke?: number[]): string {
  const codes = cells.replace(/\s+/g, '').split('') as MiniCell[];
  const size = 25;
  const parts: string[] = [];
  codes.forEach((c, i) => {
    const x = 4 + (i % 4) * size;
    const y = 4 + Math.floor(i / 4) * size;
    const cls = c === 'o' ? 'mg-cell mg-open' : c === 'x' ? 'mg-cell mg-closed' : c === '*' ? 'mg-cell mg-taken' : 'mg-cell';
    parts.push(`<rect class="${cls}" x="${x}" y="${y}" width="${size - 3}" height="${size - 3}" rx="3"/>`);
    if (c === '1' || c === '2') parts.push(`<use href="#token-${c}" x="${x + 2}" y="${y + 2}" width="${size - 7}" height="${size - 7}"/>`);
  });
  if (stroke && stroke.length) {
    const pt = (i: number) => [4 + (i % 4) * size + (size - 3) / 2, 4 + Math.floor(i / 4) * size + (size - 3) / 2];
    if (stroke.length === 4 && isSquare(stroke)) {
      const [x0, y0] = pt(Math.min(...stroke));
      parts.push(`<rect class="mg-brush" x="${x0 - 9}" y="${y0 - 9}" width="${size + 18}" height="${size + 18}" rx="14"/>`);
    } else {
      const [x1, y1] = pt(stroke[0]);
      const [x2, y2] = pt(stroke[stroke.length - 1]);
      parts.push(`<line class="mg-brush" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    }
  }
  return `<svg class="mini-garden" viewBox="0 0 105 105" role="img" aria-label="${label}">${parts.join('')}</svg>`;
}

function isSquare(cells: number[]): boolean {
  const s = [...cells].sort((a, b) => a - b);
  return s[1] === s[0] + 1 && s[2] === s[0] + 4 && s[3] === s[0] + 5;
}

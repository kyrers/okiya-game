import type { Charm } from '../engine/charms';

/** Small inline SVG glyphs for charms (24x24 viewBox). */
export function charmGlyph(charm: Charm): string {
  const g = charm.glyph;
  let body = '';
  switch (g) {
    case 'square':
      body = `<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>`;
      break;
    case 'line':
      body = `<circle cx="4" cy="12" r="2.4"/><circle cx="9.3" cy="12" r="2.4"/><circle cx="14.6" cy="12" r="2.4"/><circle cx="20" cy="12" r="2.4"/>`;
      break;
    case 'diagonal':
      body = `<circle cx="4" cy="20" r="2.4"/><circle cx="9.3" cy="14.6" r="2.4"/><circle cx="14.6" cy="9.3" r="2.4"/><circle cx="20" cy="4" r="2.4"/>`;
      break;
    case 'block':
      body = `<path d="M5 5 L19 19 M19 5 L5 19" stroke-width="3" stroke-linecap="round" fill="none" stroke="currentColor"/>`;
      break;
    case 'corner':
      body = `<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>`;
      break;
    case 'centre':
      body = `<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/>`;
      break;
    case 'symbol':
      body = `<path d="M12 3 C12 3 5 11 5 15 a7 7 0 0 0 14 0 C19 11 12 3 12 3 Z"/>`;
      break;
    case 'gate':
      body = `<path d="M3 6 H21 M5 10 H19 M7 6 V21 M17 6 V21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
      break;
    case 'tokens':
      body = `<circle cx="7" cy="8" r="3.2"/><circle cx="17" cy="8" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="3.2"/>`;
      break;
    case 'fast':
      body = `<path d="M12 3 C15 7 20 9 20 13 a8 8 0 0 1 -16 0 C4 9 9 7 12 3 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8 L12 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
      break;
  }
  return `<svg viewBox="0 0 24 24" class="charm-glyph charm-${g}" aria-hidden="true" fill="currentColor">${body}</svg>`;
}

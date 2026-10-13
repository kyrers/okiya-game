/**
 * Draws the two material textures as seamless WebP tiles (original, procedural, seeded):
 *   src/ui/textures/cloth.webp  plain-weave dyed cloth for the two grounds (grey light and shade,
 *                               blended onto either dye, so one tile serves vermilion and indigo)
 *   src/ui/textures/paper.webp  fibrous paper for the garden board and the paper panels
 * Rendered with canvas 2D in Playwright's Chromium at 512 px, shown at 256 CSS px.
 *   npx tsx scripts/render-textures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const out = new URL('../src/ui/textures/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
// tsx wraps named functions in a __name() helper; give the page a no-op one.
await page.evaluate('window.__name = (f) => f');

const pngs = await page.evaluate(() => {
  const SIZE = 512;
  let seed = 20261012;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Opaque grey tiles centred on mid-grey: the page lays them over the dye or the paper colour with
  // background-blend-mode, so mid-grey changes nothing and lighter or darker texels lift or sink it.
  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgb(128,128,128)';
    x.fillRect(0, 0, SIZE, SIZE);
    return c;
  };
  /** Draw `fn` at the tile and at its wrapped copies, so shapes crossing an edge stay seamless. */
  const wrapped = (fn: (dx: number, dy: number) => void) => {
    for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) fn(dx, dy);
  };

  /* ---- cloth: plain weave, thread by thread, with uneven dye ---- */
  const cloth = canvas();
  const c = cloth.getContext('2d')!;
  const pitch = 8; // one thread every 8 px at 512 = 4 CSS px
  const n = SIZE / pitch;
  const warp = Array.from({ length: n }, () => (rnd() - 0.5) * 0.5); // per-thread tone
  const weft = Array.from({ length: n }, () => (rnd() - 0.5) * 0.5);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = i * pitch;
      const y = j * pitch;
      const warpOnTop = (i + j) % 2 === 0;
      const tone = (warpOnTop ? warp[i] : weft[j]) + (rnd() - 0.5) * 0.25;
      // The thread on top catches light along its middle and falls into shade at its ends.
      const g = warpOnTop ? c.createLinearGradient(x, y, x, y + pitch) : c.createLinearGradient(x, y, x + pitch, y);
      const lift = 0.1 + tone * 0.12;
      g.addColorStop(0, `rgba(0,0,0,${0.16 - tone * 0.05})`);
      g.addColorStop(0.5, `rgba(255,255,255,${Math.max(0, lift)})`);
      g.addColorStop(1, `rgba(0,0,0,${0.16 - tone * 0.05})`);
      c.fillStyle = g;
      if (warpOnTop) c.fillRect(x + 1, y, pitch - 2, pitch);
      else c.fillRect(x, y + 1, pitch, pitch - 2);
      // The gap between threads.
      c.fillStyle = 'rgba(0,0,0,0.1)';
      if (warpOnTop) c.fillRect(x, y, 1, pitch);
      else c.fillRect(x, y, pitch, 1);
    }
  }
  // Slubs: a few thicker, brighter runs along single threads, as in hand-dyed cloth.
  for (let k = 0; k < 28; k++) {
    const horizontal = rnd() < 0.5;
    const line = Math.floor(rnd() * n) * pitch;
    const start = rnd() * SIZE;
    const len = 30 + rnd() * 90;
    const a = 0.05 + rnd() * 0.05; // drawn once per copy below: one value keeps the tile seamless
    wrapped((dx, dy) => {
      c.fillStyle = `rgba(255,255,255,${a})`;
      if (horizontal) c.fillRect(start + dx, line + 2 + dy, len, pitch - 4);
      else c.fillRect(line + 2 + dx, start + dy, pitch - 4, len);
    });
  }
  // Uneven dye: broad soft clouds of shade and light.
  for (let k = 0; k < 22; k++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const r = 60 + rnd() * 140;
    const dark = rnd() < 0.55;
    const a = 0.05 + rnd() * 0.07;
    wrapped((dx, dy) => {
      const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    });
  }

  /* ---- paper: fibres and fine tooth ---- */
  const paper = canvas();
  const p = paper.getContext('2d')!;
  // Tooth: a fine grain in 2x2 cells (one CSS pixel at 2x).
  const tooth = p.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 2) {
    for (let x = 0; x < SIZE; x += 2) {
      const v = rnd();
      const shade = v > 0.5 ? 255 : 70;
      const alpha = Math.floor(Math.abs(v - 0.5) * 2 * 22);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((y + oy) * SIZE + x + ox) * 4;
        tooth.data[i] = tooth.data[i + 1] = tooth.data[i + 2] = shade;
        tooth.data[i + 3] = alpha;
      }
    }
  }
  // putImageData would replace the grey; draw the grain through a second canvas instead.
  const grain = document.createElement('canvas');
  grain.width = grain.height = SIZE;
  grain.getContext('2d')!.putImageData(tooth, 0, 0);
  p.drawImage(grain, 0, 0);
  p.lineCap = 'round';
  for (let k = 0; k < 900; k++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const ang = rnd() * Math.PI;
    const len = 8 + rnd() * 34;
    const bend = (rnd() - 0.5) * 10;
    const dark = rnd() < 0.6;
    const a = 0.05 + rnd() * 0.1;
    const w = 0.6 + rnd() * 1.2;
    wrapped((dx, dy) => {
      p.strokeStyle = dark ? `rgba(90,62,28,${a})` : `rgba(255,252,240,${a * 1.4})`;
      p.lineWidth = w;
      p.beginPath();
      const x0 = x + dx;
      const y0 = y + dy;
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      p.moveTo(x0, y0);
      p.quadraticCurveTo((x0 + x1) / 2 - Math.sin(ang) * bend, (y0 + y1) / 2 + Math.cos(ang) * bend, x1, y1);
      p.stroke();
    });
  }
  return { cloth: cloth.toDataURL('image/webp', 0.72), paper: paper.toDataURL('image/webp', 0.72) };
});

for (const [name, url] of Object.entries(pngs)) {
  if (!url.startsWith('data:image/webp')) throw new Error('canvas could not encode WebP');
  writeFileSync(`${out}${name}.webp`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`src/ui/textures/${name}.webp`);
}
await browser.close();

/**
 * Renders the PNG icons in public/ from public/icon.svg (original artwork) with Playwright's
 * Chromium. Run after editing the SVG: npx tsx scripts/render-icons.ts
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../public/', import.meta.url).pathname;
const svg = readFileSync(`${root}icon.svg`, 'utf8');
// Maskable: the art scaled into the central safe zone, on the same split ground.
const maskable = svg.replace('<rect x="120"', '<g transform="translate(256 256) scale(.8) translate(-256 -256)"><rect x="120"').replace('</svg>', '</g></svg>');

const targets: { file: string; size: number; svg: string }[] = [
  { file: 'favicon-32.png', size: 32, svg },
  { file: 'apple-touch-icon.png', size: 180, svg },
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0">${t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`);
  await page.screenshot({ path: `${root}${t.file}`, omitBackground: false });
  console.log(`public/${t.file}`);
}
await browser.close();

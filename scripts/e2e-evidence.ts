/**
 * Writes the per-profile table in docs/evidence/e2e.txt from the JSON reports of the three e2e
 * passes (Playwright writes test-results/e2e.json; copy it aside after each pass).
 *
 *   npx tsx scripts/e2e-evidence.ts main.json sweep.json perf.json > docs/evidence/e2e.txt
 */
import { readFileSync } from 'node:fs';

const PROFILES = ['iphone-se', 'iphone-15', 'iphone-15-landscape', 'pixel-7', 'iphone-se-3', 'android-360', 'ipad-portrait', 'ipad-landscape', 'desktop-chrome', 'desktop-firefox', 'desktop-safari'];

interface Suite {
  specs?: { tests: { projectName: string; status: string }[] }[];
  suites?: Suite[];
}

type Count = { passed: number; skipped: number; failed: number };

function tally(path: string): { counts: Map<string, Count>; start: string } {
  const report = JSON.parse(readFileSync(path, 'utf8')) as { suites: Suite[]; stats: { startTime: string } };
  const counts = new Map<string, Count>();
  const walk = (suite: Suite): void => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const c = counts.get(t.projectName) ?? { passed: 0, skipped: 0, failed: 0 };
        if (t.status === 'expected') c.passed++;
        else if (t.status === 'skipped') c.skipped++;
        else c.failed++; // unexpected or flaky
        counts.set(t.projectName, c);
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites) walk(s);
  return { counts, start: report.stats.startTime };
}

function row(name: string, c: Count): string {
  return `  ${name.padEnd(22)} passed ${String(c.passed).padStart(3)}  skipped ${String(c.skipped).padStart(2)}  failed ${c.failed}`;
}

function section(title: string, path: string): { text: string; start: string } {
  const { counts, start } = tally(path);
  const total: Count = { passed: 0, skipped: 0, failed: 0 };
  const lines = [`== ${title}`];
  for (const p of PROFILES) {
    const c = counts.get(p) ?? { passed: 0, skipped: 0, failed: 0 };
    total.passed += c.passed;
    total.skipped += c.skipped;
    total.failed += c.failed;
    lines.push(row(p, c));
  }
  lines.push(row('total', total));
  return { text: lines.join('\n'), start };
}

const [mainPath, sweepPath, perfPath] = process.argv.slice(2);
const main = section('main (npx playwright test --grep-invert "@perf|@sweep", 6 workers)', mainPath);
const sweep = section('sweep (npx playwright test --grep @sweep --workers=6): the layout rules on 13 screen states at about 190 sizes each in WebKit (iphone-15) and Chromium as a phone (pixel-7), and at those sizes plus 7 desktop sizes in desktop Chrome at scale 2 and Firefox at scale 1 windows (desktop-chrome, desktop-firefox); every control reached by a real tap through two whole matches at 11 phone and tablet sizes (iphone-15, pixel-7, desktop-chrome) and 3 desktop sizes (the three desktop browsers)', sweepPath);
const perf = section('perf (npx playwright test --grep @perf --workers=1)', perfPath);
const when = new Date(main.start).toISOString().slice(0, 16).replace('T', ' ');
console.log(`End-to-end results of the final run on the production build (${when} UTC), 11 device profiles.

${main.text}

${sweep.text}

${perf.text}

Skipped tests are engine-scoped by design: keyboard play on touch profiles; offline, install, wake-lock, axe and CSP checks run in one or two engines; the sweep pass runs only where its sizes belong (see its heading).`);

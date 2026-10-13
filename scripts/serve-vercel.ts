/**
 * Serves dist/ with the headers from vercel.json applied (cache rules, security headers, CSP), so
 * the production page can be tested under the exact policy Vercel will send.
 *   npx tsx scripts/serve-vercel.ts [port=4180] [host=127.0.0.1]
 * Loopback only unless a host is given (e.g. 0.0.0.0 to test on a phone on the same Wi-Fi).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const rules = config.headers.map((h) => ({ re: new RegExp(`^${h.source.replace(/\(\.\*\)/g, '.*')}$`), headers: h.headers }));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};
const port = Number(process.argv[2] ?? 4180);
const host = process.argv[3] ?? '127.0.0.1';
createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(dist, path));
  if (!file.startsWith(dist)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end('not found');
  for (const r of rules) if (r.re.test(path)) for (const h of r.headers) res.setHeader(h.key, h.value);
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
  // Loopback unless a host was passed on purpose: a test server is not reachable from the network.
}).listen(port, host, () => console.log(`dist/ with vercel.json headers on http://${host}:${port}/`));

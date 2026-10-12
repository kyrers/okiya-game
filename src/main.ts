import '@fontsource/shippori-mincho-b1/latin-800.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-600.css';
import '@fontsource/source-sans-3/latin-700.css';
import './ui/styles.css';
import { App } from './ui/app';

// Load every face now, not on first use: a weight first needed at the end of a game would
// otherwise arrive late and reflow the text after the layout has been fitted.
for (const face of ['800 1em "Shippori Mincho B1"', '400 1em "Source Sans 3"', '600 1em "Source Sans 3"', '700 1em "Source Sans 3"']) {
  void document.fonts?.load(face).catch(() => undefined);
}
void document.fonts?.load('800 1em "Okiya Ellipsis"', '\u2026').catch(() => undefined);

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');
new App(root).start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

import '@fontsource/shippori-mincho-b1/latin-800.css';
import '@fontsource/zen-kaku-gothic-new/latin-400.css';
import '@fontsource/zen-kaku-gothic-new/latin-500.css';
import '@fontsource/zen-kaku-gothic-new/latin-700.css';
import './ui/styles.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');
new App(root).start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

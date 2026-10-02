import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works from any sub-path (GitHub Pages, Netlify, S3...).
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});

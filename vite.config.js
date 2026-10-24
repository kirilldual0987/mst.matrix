import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  server: {
    host: true,
  },
});

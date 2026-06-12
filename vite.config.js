import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
    target: 'es2022',
  },
  server: {
    host: true,
  },
});

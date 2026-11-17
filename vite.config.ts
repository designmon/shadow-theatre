import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), creatures: resolve(import.meta.dirname, 'creatures.html') },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});

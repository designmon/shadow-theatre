import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), creatures: resolve(__dirname, 'creatures.html') },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});

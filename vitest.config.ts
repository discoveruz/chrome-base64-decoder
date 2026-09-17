import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The decode engine under lib/ imports no browser.* APIs, so it runs in plain
// Node — atob, Blob, Response and (De)CompressionStream are all global there.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});

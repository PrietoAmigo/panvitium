import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the internal source packages straight to their TypeScript source
    // (the internal-source-package model), so dev, build, and tests all agree.
    alias: {
      '@panvitium/sim': resolve(here, '../../packages/sim/src/index.ts'),
      '@panvitium/shared': resolve(here, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

import path from 'path';
import { defineConfig } from 'vitest/config';

const rootDir = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  root: rootDir,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(rootDir, 'vitest.setup.ts')],
    include: ['scripts/sim/**/*.sim.test.ts', 'scripts/sim/**/*.sim.test.tsx'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
});

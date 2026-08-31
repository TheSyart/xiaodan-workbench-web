import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@xiaodan/contracts': resolve(import.meta.dirname, 'packages/contracts/src/index.ts'),
      '@xiaodan/domain': resolve(import.meta.dirname, 'packages/domain/src/index.ts')
    }
  },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
    environmentMatchGlobs: [['apps/web/**/*.test.{ts,tsx}', 'jsdom']],
    setupFiles: ['./apps/web/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['apps/server/src/**/*.ts', 'packages/domain/src/**/*.ts'],
      exclude: ['apps/server/src/index.ts'],
      thresholds: { lines: 85, branches: 70, functions: 85, statements: 85 }
    }
  }
});

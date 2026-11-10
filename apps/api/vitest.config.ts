import { defineConfig } from 'vitest/config';

// Tests share one real database, so test files run one at a time.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/helpers/setup-env.ts'],
    globalSetup: ['test/helpers/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

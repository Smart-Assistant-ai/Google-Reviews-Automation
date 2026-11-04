import { defineConfig } from 'vitest/config';

// Fast tests that need no database. `pnpm test` runs these and the integration tests together.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/helpers/setup-env.ts'],
  },
});

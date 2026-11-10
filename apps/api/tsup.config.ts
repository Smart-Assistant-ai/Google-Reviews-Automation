import { defineConfig } from 'tsup';

// The shared package is bundled into the API, so production never depends on a
// separately built copy of it being present on the server.
export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/seed.ts', 'src/scripts/allow-signup.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@replypilot/shared'],
});

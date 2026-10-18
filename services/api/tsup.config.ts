import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source (ADR 001), so they are bundled in;
// everything from npm stays external and is installed next to dist/.
export default defineConfig({
  entry: ['src/server.ts', 'src/worker/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@hunarpramaan\//],
  // PGlite loads its own data files at runtime and is only for local runs.
  external: ['@electric-sql/pglite'],
});

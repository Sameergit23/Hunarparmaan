import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // A real PostgreSQL is shared, so its test files must not run at the same time.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});

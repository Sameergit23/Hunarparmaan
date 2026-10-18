// `pnpm --filter @hunarpramaan/mobile db:generate` writes a new migration from
// src/db/schema.ts. The `expo` driver also writes drizzle/migrations.js, which
// the app bundles and applies when it opens the database.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

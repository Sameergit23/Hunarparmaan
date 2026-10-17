/**
 * Vitest global setup. Starting PGlite from scratch runs initdb, which takes
 * about 15 seconds; loading a saved data directory takes about one. So we build
 * one migrated snapshot, cache it by a hash of the migrations, and every test
 * file loads it. With TEST_DATABASE_URL set (CI), tests use real PostgreSQL instead.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { MIGRATIONS_DIR, wrapPglite } from '../db/client';

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteSnapshot: string | null;
  }
}

function migrationsHash(): string {
  const hash = createHash('sha256');
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (file.endsWith('.sql'))
      hash.update(file).update(readFileSync(path.join(MIGRATIONS_DIR, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    project.provide('pgliteSnapshot', null);
    return;
  }
  const dir = path.resolve('node_modules/.cache/hunarpramaan');
  const file = path.join(dir, `pglite-${migrationsHash()}.tar`);
  if (!existsSync(file)) {
    const { PGlite } = await import('@electric-sql/pglite');
    const database = await wrapPglite(new PGlite());
    await database.migrate();
    const client = (database.db as unknown as { $client: InstanceType<typeof PGlite> }).$client;
    const dump = await client.dumpDataDir('none');
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
    await database.close();
  }
  project.provide('pgliteSnapshot', file);
}

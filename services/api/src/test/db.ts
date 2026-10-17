import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { inject } from 'vitest';
import { openDatabase, wrapPglite, type Database } from '../db/client';

/**
 * A fresh, migrated database for one test file: a copy of the cached PGlite
 * snapshot, or, with TEST_DATABASE_URL, a real PostgreSQL reset to empty.
 */
export async function testDatabase(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const database = await openDatabase(url);
    await database.db.execute(sql`drop schema if exists public cascade`);
    await database.db.execute(sql`drop schema if exists drizzle cascade`);
    await database.db.execute(sql`create schema public`);
    await database.migrate();
    return database;
  }
  const snapshot = inject('pgliteSnapshot');
  if (!snapshot) throw new Error('no PGlite snapshot: run tests through vitest');
  const { PGlite } = await import('@electric-sql/pglite');
  const loadDataDir = new Blob([readFileSync(snapshot)]);
  return wrapPglite(new PGlite({ loadDataDir }));
}

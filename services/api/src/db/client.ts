import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Schema = typeof schema;
/** Works for both drivers: node-postgres in production, PGlite for tests and local runs. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  db: Db;
  driver: 'pg' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR ?? 'migrations');

/**
 * `postgres://…` connects to PostgreSQL. `pglite://memory` runs an in-memory
 * Postgres (tests), and `pglite:./dir` keeps one on disk (local runs without Docker).
 */
export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const target = url.slice('pglite:'.length);
    if (target === '//memory' || target === '') return wrapPglite(new PGlite());
    mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    return wrapPglite(new PGlite(path.resolve(target)));
  }

  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    driver: 'pg',
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => pool.end(),
  };
}

/** Wrap an existing PGlite instance, for example one loaded from a test snapshot. */
export async function wrapPglite(client: PGlite): Promise<Database> {
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const db = drizzle(client, { schema });
  return {
    db: db as unknown as Db,
    driver: 'pglite',
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => client.close(),
  };
}

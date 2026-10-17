import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/db';
import type { Database } from './client';
import { isAppendOnlyViolation } from './errors';
import { APPEND_ONLY_TABLES } from './schema';

let database: Database;

beforeAll(async () => {
  database = await testDatabase();
});
afterAll(() => database.close());

const rows = async <T>(query: ReturnType<typeof sql>) =>
  ((await database.db.execute(query)) as unknown as { rows: T[] }).rows;

describe('migrations', () => {
  it('create every table', async () => {
    const tables = await rows<{ name: string }>(
      sql`select table_name as name from information_schema.tables where table_schema = 'public'`,
    );
    const names = tables.map((t) => t.name);
    for (const table of APPEND_ONLY_TABLES) expect(names).toContain(table);
    expect(names).toContain('users');
  });

  it('rule 4: put an append-only trigger on every event table', async () => {
    const triggers = await rows<{ table: string }>(
      sql`select event_object_table as table from information_schema.triggers
          where trigger_name like '%_append_only'`,
    );
    expect(new Set(triggers.map((t) => t.table))).toEqual(new Set(APPEND_ONLY_TABLES));
  });

  it('rule 4: reject UPDATE and DELETE on an append-only table', async () => {
    await database.db.execute(
      sql`insert into flags (id, kind, detail) values ('0192c0de-0000-7000-8000-000000000001', 'clock_drift', 'test')`,
    );
    const attempt = (query: ReturnType<typeof sql>) =>
      database.db.execute(query).then(
        () => 'allowed',
        (error: unknown) => (isAppendOnlyViolation(error) ? 'blocked' : String(error)),
      );
    expect(await attempt(sql`update flags set detail = 'edited'`)).toBe('blocked');
    expect(await attempt(sql`delete from flags`)).toBe('blocked');
  });
});

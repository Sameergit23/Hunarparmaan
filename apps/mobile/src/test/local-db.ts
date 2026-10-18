/**
 * The phone's schema and migrations on sql.js (SQLite compiled to WebAssembly),
 * so the outbox runs in Vitest exactly as it does on expo-sqlite.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import initSqlJs from 'sql.js';
import type { Actor } from '@hunarpramaan/contracts';
import { idFactory } from '../core/ids';
import type { EventSource, LocalDb } from '../db/outbox';

export const ids = idFactory((n) => new Uint8Array(randomBytes(n)));

export async function openTestDb(): Promise<LocalDb> {
  const SQL = await initSqlJs();
  const client = new SQL.Database();
  client.run('PRAGMA foreign_keys = ON');
  const db = drizzle(client);
  migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, '../../drizzle') });
  return db;
}

export const mobiliser: Actor = {
  kind: 'user',
  userId: '6f1c2a34-1d2e-4b5f-8a9b-0c1d2e3f4a5b',
  role: 'mobiliser',
};

export const deviceMapper: Actor = { kind: 'system', service: 'device-mapper' };

/** An event source with a clock that moves one second per event. */
export function testSource(deviceId = 'hp-test-phone'): EventSource {
  let t = Date.parse('2026-10-20T10:00:00.000Z');
  return {
    deviceId,
    actor: mobiliser,
    now: () => new Date((t += 1000)),
    newEventId: ids.eventId,
  };
}

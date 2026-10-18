/**
 * The phone's local database (ADR 003): expo-sqlite with SQLCipher, through
 * Drizzle. Every write lands in its own table and, in the same transaction, in
 * `outbox` as a sealed sync event. Rows are never updated or deleted (rule 4):
 * delivery is recorded by adding an `outbox_acks` row.
 *
 * After a change here, run `pnpm --filter @hunarpramaan/mobile db:generate`.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SyncEvent } from '@hunarpramaan/contracts';

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** This phone's identity. One row, created with the database, so the chain and its id go together. */
export const device = sqliteTable('device', {
  id: text('id').primaryKey(),
  createdAt: createdAt(),
});

/** Sealed events in hash-chain order, exactly as they are pushed to POST /v1/sync/push. */
export const outbox = sqliteTable('outbox', {
  /** The event id, a UUIDv7. */
  id: text('id').primaryKey(),
  seq: integer('seq').notNull().unique(),
  type: text('type').notNull(),
  hash: text('hash').notNull(),
  event: text('event', { mode: 'json' }).$type<SyncEvent>().notNull(),
  createdAt: createdAt(),
});

/** The server's acknowledgement of an event: `stored`, or `duplicate` when it already had it. */
export const outboxAcks = sqliteTable('outbox_acks', {
  eventId: text('event_id')
    .primaryKey()
    .references(() => outbox.id),
  status: text('status').$type<'stored' | 'duplicate'>().notNull(),
  ackedAt: text('acked_at').notNull(),
});

export const workers = sqliteTable('workers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  language: text('language').$type<'hi' | 'en'>().notNull(),
  eventId: text('event_id')
    .notNull()
    .references(() => outbox.id),
  registeredAt: text('registered_at').notNull(),
});

export const consents = sqliteTable('consents', {
  id: text('id').primaryKey(),
  workerId: text('worker_id')
    .notNull()
    .references(() => workers.id),
  noticeVersion: text('notice_version').notNull(),
  language: text('language').$type<'hi' | 'en'>().notNull(),
  readAloud: integer('read_aloud', { mode: 'boolean' }).notNull(),
  eventId: text('event_id')
    .notNull()
    .references(() => outbox.id),
  givenAt: text('given_at').notNull(),
});

export const declarations = sqliteTable('declarations', {
  id: text('id').primaryKey(),
  workerId: text('worker_id')
    .notNull()
    .references(() => workers.id),
  language: text('language').$type<'hi' | 'en'>().notNull(),
  source: text('source').$type<'vosk' | 'bhashini' | 'typed'>().notNull(),
  asrTranscript: text('asr_transcript').notNull(),
  transcript: text('transcript').notNull(),
  eventId: text('event_id')
    .notNull()
    .references(() => outbox.id),
  recordedAt: text('recorded_at').notNull(),
});

/** The on-device keyword match: a suggestion only (rule 1). */
export const mappingSuggestions = sqliteTable('mapping_suggestions', {
  /** The event id. */
  id: text('id')
    .primaryKey()
    .references(() => outbox.id),
  declarationId: text('declaration_id')
    .notNull()
    .references(() => declarations.id),
  packVersion: text('pack_version').notNull(),
  suggestedNqrCode: text('suggested_nqr_code'),
  suggestedRoute: text('suggested_route').$type<'direct_assessment' | 'bridge_module'>().notNull(),
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull(),
  results: text('results', { mode: 'json' }).notNull(),
  createdAt: text('suggested_at').notNull(),
});

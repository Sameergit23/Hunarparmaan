/**
 * The outbox (ADR 003). Each write is one transaction: seal the event after the
 * device's chain head, check it as the server will, then store it in `outbox`
 * and in its own table. The sync loop pushes the outbox in `seq` order.
 */
import { asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { entryHash, seal, type ChainLink } from '@hunarpramaan/audit';
import {
  EventPayloads,
  SyncEvent,
  type Actor,
  type DeviceEventType,
  type EventPayload,
  type SyncAck,
  type SyncEventOf,
} from '@hunarpramaan/contracts';
import { projectLocally } from './projection';
import { outbox, outboxAcks } from './schema';

/** Expo's driver on the phone, sql.js in tests: both are synchronous SQLite. */
export type LocalDb = BaseSQLiteDatabase<'sync', unknown>;
export type LocalTx = Parameters<Parameters<LocalDb['transaction']>[0]>[0];

export interface EventSource {
  deviceId: string;
  /** The signed-in person; the on-device mapper passes its own system actor. */
  actor: Actor;
  now: () => Date;
  newEventId: () => string;
}

/** The last event in this device's chain, or null before the first one. */
export function chainHead(db: LocalDb | LocalTx): ChainLink | null {
  const row = db
    .select({ event: outbox.event })
    .from(outbox)
    .orderBy(desc(outbox.seq))
    .limit(1)
    .get();
  return row?.event ?? null;
}

/**
 * Record one event: seal it into the chain, store it in the outbox and project
 * it into its table, all in one transaction. Throws, and stores nothing, if the
 * event would not pass the server's checks (schema, or AUTHORITY for the actor).
 */
export function appendEvent<T extends DeviceEventType>(
  db: LocalDb,
  source: EventSource,
  type: T,
  payload: EventPayload<T>,
  options: { actor?: Actor } = {},
): SyncEventOf<T> {
  // The server hashes the event as zod parses it, and parsing trims text, so
  // seal the parsed payload or a stray space would break the chain check.
  const normalized = EventPayloads[type].parse(payload) as EventPayload<T>;
  return db.transaction((tx) => {
    const body = {
      id: source.newEventId(),
      deviceId: source.deviceId,
      occurredAt: source.now().toISOString(),
      actor: options.actor ?? source.actor,
      type,
      payload: normalized,
    };
    const event = seal(chainHead(tx), body as never) as unknown as SyncEventOf<T>;
    const parsed = SyncEvent.parse(event);
    if (entryHash(parsed) !== event.hash) {
      throw new Error(`${type} changed when it was validated, so its hash would not verify`);
    }
    tx.insert(outbox)
      .values({ id: event.id, seq: event.seq, type, hash: event.hash, event: event as SyncEvent })
      .run();
    projectLocally(tx, event as SyncEvent);
    return event;
  });
}

const pending = (db: LocalDb) =>
  db
    .select({ event: outbox.event })
    .from(outbox)
    .leftJoin(outboxAcks, eq(outboxAcks.eventId, outbox.id))
    .where(isNull(outboxAcks.eventId));

/** Events the server has not acknowledged yet, oldest first. */
export function pendingEvents(db: LocalDb, limit: number): SyncEvent[] {
  return pending(db)
    .orderBy(asc(outbox.seq))
    .limit(limit)
    .all()
    .map((row) => row.event);
}

/** The pending count shown on screen: unacknowledged outbox rows (ADR 003). */
export function pendingCount(db: LocalDb): number {
  const row = db
    .select({ n: count() })
    .from(outbox)
    .leftJoin(outboxAcks, eq(outboxAcks.eventId, outbox.id))
    .where(isNull(outboxAcks.eventId))
    .get();
  return row?.n ?? 0;
}

/**
 * Store the server's acks for events this phone sent. `stored` and `duplicate`
 * both mean the server has the event. A `rejected` event stays pending, and is
 * returned so the sync loop can stop and say why.
 */
export function recordAcks(
  db: LocalDb,
  sentIds: readonly string[],
  acks: readonly SyncAck[],
  at: Date,
): { delivered: number; rejected: SyncAck[] } {
  const sent = new Set(sentIds);
  const delivered = acks.filter(
    (ack) => sent.has(ack.id) && (ack.status === 'stored' || ack.status === 'duplicate'),
  );
  const rejected = acks.filter((ack) => sent.has(ack.id) && ack.status === 'rejected');
  if (delivered.length > 0) {
    db.transaction((tx) => {
      const already = new Set(
        tx
          .select({ id: outboxAcks.eventId })
          .from(outboxAcks)
          .where(
            inArray(
              outboxAcks.eventId,
              delivered.map((ack) => ack.id),
            ),
          )
          .all()
          .map((row) => row.id),
      );
      for (const ack of delivered) {
        if (already.has(ack.id)) continue;
        tx.insert(outboxAcks)
          .values({
            eventId: ack.id,
            status: ack.status as 'stored' | 'duplicate',
            ackedAt: at.toISOString(),
          })
          .run();
      }
    });
  }
  return { delivered: delivered.length, rejected };
}

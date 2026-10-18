import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { verifyChain } from '@hunarpramaan/audit';
import { SyncPushRequest, type EventPayload } from '@hunarpramaan/contracts';
import { deviceMapper, ids, openTestDb, testSource } from '../test/local-db';
import { ensureDeviceId } from './device';
import {
  appendEvent,
  chainHead,
  pendingCount,
  pendingEvents,
  recordAcks,
  type LocalDb,
} from './outbox';
import { consents, declarations, outbox, workers } from './schema';

let db: LocalDb;
const source = testSource();

beforeEach(async () => {
  db = await openTestDb();
});

function registerWorker(): string {
  const workerId = ids.entityId();
  appendEvent(db, source, 'worker.registered', {
    workerId,
    name: 'Demo Worker',
    phone: '9000000199',
    language: 'hi',
  });
  return workerId;
}

function declare(workerId: string, transcript = 'दस साल से वायरिंग करता हूँ'): string {
  const declarationId = ids.entityId();
  appendEvent(db, source, 'declaration.recorded', {
    declarationId,
    workerId,
    language: 'hi',
    source: 'vosk',
    asrTranscript: transcript,
    transcript,
  });
  return declarationId;
}

describe('appendEvent', () => {
  it('seals events into one unbroken chain that starts at seq 1', () => {
    const workerId = registerWorker();
    appendEvent(db, source, 'consent.given', {
      consentId: ids.entityId(),
      workerId,
      noticeVersion: 'v1',
      language: 'hi',
      readAloud: true,
    });
    declare(workerId);

    const events = pendingEvents(db, 10);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.type)).toEqual([
      'worker.registered',
      'consent.given',
      'declaration.recorded',
    ]);
    expect(verifyChain(events)).toMatchObject({ ok: true, count: 3 });
    expect(chainHead(db)?.seq).toBe(3);
  });

  it('writes the event and its own row in the same transaction', () => {
    const workerId = registerWorker();
    declare(workerId);
    const [declaration] = db.select().from(declarations).all();
    const [row] = db
      .select()
      .from(outbox)
      .where(sql`${outbox.seq} = 2`)
      .all();
    expect(declaration?.eventId).toBe(row?.id);
    expect(declaration?.transcript).toBe('दस साल से वायरिंग करता हूँ');
  });

  it('stores nothing when the row cannot be written', () => {
    // No such worker: the consent row breaks a foreign key, so the event must not stay either.
    expect(() =>
      appendEvent(db, source, 'consent.given', {
        consentId: ids.entityId(),
        workerId: ids.entityId(),
        noticeVersion: 'v1',
        language: 'hi',
        readAloud: false,
      }),
    ).toThrow();
    expect(pendingCount(db)).toBe(0);
    expect(db.select().from(consents).all()).toEqual([]);
  });

  it('refuses events the actor may not create, before anything is stored', () => {
    const workerId = registerWorker();
    const declarationId = declare(workerId);
    const suggestion: EventPayload<'mapping.suggested'> = {
      declarationId,
      packVersion: '2026.10.0',
      engine: 'device_keyword',
      results: [],
      suggestedNqrCode: null,
      suggestedRoute: 'bridge_module',
      needsReview: true,
    };
    // Rule 1: a mobiliser may not post the AI's suggestion as their own.
    expect(() => appendEvent(db, source, 'mapping.suggested', suggestion)).toThrow(
      /may not create/,
    );
    expect(pendingCount(db)).toBe(2);

    appendEvent(db, source, 'mapping.suggested', suggestion, { actor: deviceMapper });
    expect(pendingCount(db)).toBe(3);
  });

  it('seals text as the server parses it, so the hash still verifies there', () => {
    const workerId = registerWorker();
    declare(workerId, '  MCB lagata hoon  ');
    // What the API does: JSON over the wire, zod parse, then the chain check.
    const wire = JSON.parse(JSON.stringify(pendingEvents(db, 10)));
    const request = SyncPushRequest.parse({
      protocol: 1,
      deviceId: source.deviceId,
      sentAt: new Date().toISOString(),
      events: wire,
    });
    expect(verifyChain(request.events)).toMatchObject({ ok: true, count: 2 });
    expect(db.select().from(declarations).all()[0]?.transcript).toBe('MCB lagata hoon');
  });

  it('refuses updates and deletes (rule 4)', () => {
    registerWorker();
    // Drizzle wraps the SQLite error; the trigger's message is its cause.
    const refusal = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return String((error as Error).cause);
      }
      return 'no error';
    };
    expect(refusal(() => db.run(sql`UPDATE workers SET name = 'Someone else'`))).toMatch(
      /workers is append-only/,
    );
    expect(refusal(() => db.run(sql`DELETE FROM outbox`))).toMatch(/outbox is append-only/);
    expect(db.select().from(workers).all()).toHaveLength(1);
  });
});

describe('pending events and acks', () => {
  it('returns pending events oldest first, in batches', () => {
    const workerId = registerWorker();
    declare(workerId);
    declare(workerId);
    expect(pendingEvents(db, 2).map((e) => e.seq)).toEqual([1, 2]);
    expect(pendingCount(db)).toBe(3);
  });

  it('counts stored and duplicate acks as delivered, and keeps rejected events pending', () => {
    const workerId = registerWorker();
    declare(workerId);
    declare(workerId);
    const [first, second, third] = pendingEvents(db, 10);
    const result = recordAcks(
      db,
      [first!.id, second!.id, third!.id],
      [
        { id: first!.id, status: 'stored' },
        { id: second!.id, status: 'duplicate' },
        { id: third!.id, status: 'rejected', reason: 'hash chain broken at seq 3' },
      ],
      new Date(),
    );
    expect(result.delivered).toBe(2);
    expect(result.rejected.map((a) => a.id)).toEqual([third!.id]);
    expect(pendingEvents(db, 10).map((e) => e.seq)).toEqual([3]);
  });

  it('ignores acks for events it did not send, and acks that arrive twice', () => {
    registerWorker();
    const [event] = pendingEvents(db, 10);
    const ack = { id: event!.id, status: 'stored' as const };
    recordAcks(db, [event!.id], [ack, { id: ids.eventId(), status: 'stored' }], new Date());
    expect(() => recordAcks(db, [event!.id], [ack], new Date())).not.toThrow();
    expect(pendingCount(db)).toBe(0);
  });
});

describe('ensureDeviceId', () => {
  it('makes the id once and keeps it', () => {
    const first = ensureDeviceId(db, ids.deviceId);
    expect(first).toMatch(/^hp-[0-9a-f]{24}$/);
    expect(ensureDeviceId(db, ids.deviceId)).toBe(first);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { verifyChain } from '@hunarpramaan/audit';
import {
  SyncPushRequest,
  type SyncEvent,
  type SyncPushRequest as PushRequest,
  type SyncPushResponse,
} from '@hunarpramaan/contracts';
import { appendEvent, pendingCount, type LocalDb } from '../db/outbox';
import { ids, openTestDb, testSource } from '../test/local-db';
import { HttpStatusError, pushPending, type PushTransport } from './sync';

let db: LocalDb;
const source = testSource();
const now = () => new Date('2026-10-20T12:00:00.000Z');

beforeEach(async () => {
  db = await openTestDb();
});

function record(count: number) {
  const workerId = ids.entityId();
  appendEvent(db, source, 'worker.registered', {
    workerId,
    name: 'Demo Worker',
    phone: '9000000199',
    language: 'hi',
  });
  for (let i = 1; i < count; i++) {
    appendEvent(db, source, 'declaration.recorded', {
      declarationId: ids.entityId(),
      workerId,
      language: 'hi',
      source: 'typed',
      asrTranscript: '',
      transcript: `answer ${i}`,
    });
  }
}

/** Enough of the API's push handler: idempotent by id, events must continue the chain. */
function fakeServer(options: { rejectSeq?: number } = {}) {
  const stored: SyncEvent[] = [];
  const requests: PushRequest[] = [];
  const transport: PushTransport = async (request) => {
    const parsed = SyncPushRequest.parse(JSON.parse(JSON.stringify(request)));
    requests.push(parsed);
    const response: SyncPushResponse = { serverTime: now().toISOString(), acks: [], uploads: [] };
    for (const event of parsed.events as SyncEvent[]) {
      if (stored.some((e) => e.id === event.id)) {
        response.acks.push({ id: event.id, status: 'duplicate' });
      } else if (event.seq === options.rejectSeq || response.acks.at(-1)?.status === 'rejected') {
        response.acks.push({ id: event.id, status: 'rejected', reason: 'hash chain broken' });
      } else {
        stored.push(event);
        response.acks.push({ id: event.id, status: 'stored' });
      }
    }
    return response;
  };
  return { stored, requests, transport };
}

describe('pushPending', () => {
  it('pushes the whole outbox in chain order, one batch at a time', async () => {
    record(5);
    const server = fakeServer();
    const outcome = await pushPending({
      db,
      deviceId: source.deviceId,
      transport: server.transport,
      now,
      batchSize: 2,
    });
    expect(outcome).toEqual({ kind: 'done', delivered: 5 });
    expect(server.requests.map((r) => r.events.map((e) => e.seq))).toEqual([[1, 2], [3, 4], [5]]);
    expect(verifyChain(server.stored)).toMatchObject({ ok: true, count: 5 });
    expect(pendingCount(db)).toBe(0);
  });

  it('does nothing when the outbox is empty', async () => {
    const server = fakeServer();
    const outcome = await pushPending({
      db,
      deviceId: source.deviceId,
      transport: server.transport,
      now,
    });
    expect(outcome).toEqual({ kind: 'done', delivered: 0 });
    expect(server.requests).toEqual([]);
  });

  it('stops at a rejected event and keeps it and everything after it pending', async () => {
    record(4);
    const server = fakeServer({ rejectSeq: 3 });
    const outcome = await pushPending({
      db,
      deviceId: source.deviceId,
      transport: server.transport,
      now,
    });
    expect(outcome).toMatchObject({
      kind: 'rejected',
      delivered: 2,
      ack: { reason: 'hash chain broken' },
    });
    expect(pendingCount(db)).toBe(2);
  });

  it('resends after a lost answer, and the server answers duplicate', async () => {
    record(3);
    const server = fakeServer();
    // The server stores the batch, but the answer never reaches the phone.
    const lostAnswer: PushTransport = async (request) => {
      await server.transport(request);
      throw new TypeError('Network request failed');
    };
    const first = await pushPending({ db, deviceId: source.deviceId, transport: lostAnswer, now });
    expect(first.kind).toBe('failed');
    expect(pendingCount(db)).toBe(3);

    const second = await pushPending({
      db,
      deviceId: source.deviceId,
      transport: server.transport,
      now,
    });
    expect(second).toEqual({ kind: 'done', delivered: 3 });
    expect(server.stored).toHaveLength(3);
  });

  it('reports an expired sign-in or an unbound phone without retrying', async () => {
    record(1);
    const expired: PushTransport = async () => {
      throw new HttpStatusError(401, 'unauthorized', 'Your sign-in has expired');
    };
    const outcome = await pushPending({ db, deviceId: source.deviceId, transport: expired, now });
    expect(outcome).toEqual({ kind: 'unauthorized', delivered: 0, status: 401 });
    expect(pendingCount(db)).toBe(1);
  });

  it('treats a server error or a malformed answer as a failure', async () => {
    record(1);
    const broken: PushTransport = async () => ({ acks: 'nope' });
    const outcome = await pushPending({ db, deviceId: source.deviceId, transport: broken, now });
    expect(outcome.kind).toBe('failed');
    expect(pendingCount(db)).toBe(1);
  });

  it('gives up on an answer that acknowledges nothing, instead of looping', async () => {
    record(1);
    const silent: PushTransport = async () => ({
      serverTime: now().toISOString(),
      acks: [],
      uploads: [],
    });
    const outcome = await pushPending({ db, deviceId: source.deviceId, transport: silent, now });
    expect(outcome.kind).toBe('failed');
  });
});

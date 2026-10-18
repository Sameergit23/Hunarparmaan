/**
 * One sync pass: push the outbox to POST /v1/sync/push in hash-chain order, in
 * batches, until it is empty or something stops it. The server stores events
 * idempotently by id (IT-01), so sending an event twice is harmless.
 */
import {
  SYNC_PROTOCOL_VERSION,
  SyncPushResponse,
  type SyncAck,
  type SyncPushRequest,
} from '@hunarpramaan/contracts';
import { pendingEvents, recordAcks, type LocalDb } from '../db/outbox';

/** The server's limit is 500 events per push; smaller batches suit a weak signal. */
export const PUSH_BATCH_SIZE = 50;

/** An HTTP answer other than 2xx. Network failures are thrown as other errors. */
export class HttpStatusError extends Error {
  override name = 'HttpStatusError';
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

export type PushTransport = (request: SyncPushRequest) => Promise<unknown>;

export type PushOutcome =
  /** Everything is delivered. */
  | { kind: 'done'; delivered: number }
  /** The server refused an event; it stays pending, and so does everything after it. */
  | { kind: 'rejected'; delivered: number; ack: SyncAck }
  /** The sign-in has expired, or this phone is not bound to the account. */
  | { kind: 'unauthorized'; delivered: number; status: 401 | 403 }
  /** No answer, or a server error: try again later. */
  | { kind: 'failed'; delivered: number; error: unknown };

export async function pushPending(options: {
  db: LocalDb;
  deviceId: string;
  transport: PushTransport;
  now: () => Date;
  batchSize?: number;
}): Promise<PushOutcome> {
  const { db, deviceId, transport, now } = options;
  const batchSize = options.batchSize ?? PUSH_BATCH_SIZE;
  let delivered = 0;

  for (;;) {
    const events = pendingEvents(db, batchSize);
    if (events.length === 0) return { kind: 'done', delivered };

    let response: SyncPushResponse;
    try {
      const body = await transport({
        protocol: SYNC_PROTOCOL_VERSION,
        deviceId,
        sentAt: now().toISOString(),
        events,
      });
      response = SyncPushResponse.parse(body);
    } catch (error) {
      if (error instanceof HttpStatusError && (error.status === 401 || error.status === 403)) {
        return { kind: 'unauthorized', delivered, status: error.status };
      }
      return { kind: 'failed', delivered, error };
    }

    const result = recordAcks(
      db,
      events.map((e) => e.id),
      response.acks,
      now(),
    );
    delivered += result.delivered;
    const [rejected] = result.rejected;
    if (rejected) return { kind: 'rejected', delivered, ack: rejected };
    // An answer that acknowledged nothing would loop forever; treat it as a failure.
    if (result.delivered === 0) {
      return { kind: 'failed', delivered, error: new Error('the server acknowledged no events') };
    }
  }
}

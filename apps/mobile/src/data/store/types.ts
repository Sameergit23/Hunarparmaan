/**
 * The phone's local store (ADR 003, docs/design/mobile-app.md "Offline data").
 *
 * Three kinds of data:
 * - records: JSON values by collection and id (events the phone made, the
 *   downloaded trade pack, server checks, screen state);
 * - the outbox: sync events waiting to be pushed, in chain order;
 * - meta: small values such as the device id, the chain head and the session.
 *
 * Writes that belong together go in one `transaction`: a record and its outbox
 * event, and the new chain head, commit together or not at all.
 */
import type { DeviceEventType, SyncEvent } from '@hunarpramaan/contracts';

export interface OutboxEntry {
  /** The event's place in the device chain; the outbox is ordered by it. */
  seq: number;
  id: string;
  type: DeviceEventType;
  event: SyncEvent;
  /** `rejected` entries stay, with the server's reason, so nobody loses them silently. */
  status: 'pending' | 'rejected';
  reason?: string;
  queuedAt: string;
}

export interface OutboxCounts {
  pending: number;
  rejected: number;
}

/** What a commit changed, for listeners (the sync engine, live screens). */
export interface StoreChange {
  collections: readonly string[];
  meta: readonly string[];
  /** Events added to the outbox by this commit. */
  outboxAdded: number;
  /** True when any outbox entry was added, removed or rejected. */
  outboxChanged: boolean;
}

export interface StoreReader {
  getRecord<T>(collection: string, id: string): Promise<T | undefined>;
  getMeta<T>(key: string): Promise<T | undefined>;
}

/** Writes inside a transaction are staged and committed together when it ends. */
export interface StoreTx extends StoreReader {
  putRecord(collection: string, id: string, value: unknown): void;
  setMeta(key: string, value: unknown): void;
  deleteMeta(key: string): void;
  /** Append a sealed event to the outbox. */
  enqueue(event: SyncEvent): void;
  /** Drop an event the server stored or already had. */
  dequeue(id: string): void;
  /** Keep an event the server refused, with its reason. */
  reject(id: string, reason: string): void;
}

export interface LocalStore extends StoreReader {
  listRecords<T>(collection: string): Promise<T[]>;
  putRecord(collection: string, id: string, value: unknown): Promise<void>;
  setMeta(key: string, value: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
  /**
   * Run `work` and commit everything it staged atomically. Transactions run
   * one at a time, so two writers never seal onto the same chain head.
   * Throwing inside `work` commits nothing. Never start a transaction inside
   * another one: use the `tx` you were given.
   */
  transaction<R>(work: (tx: StoreTx) => Promise<R>): Promise<R>;
  outbox: {
    /** Pending events in chain order, up to `limit`. */
    pending(limit?: number): Promise<OutboxEntry[]>;
    rejected(): Promise<OutboxEntry[]>;
    counts(): Promise<OutboxCounts>;
  };
  subscribe(listener: (change: StoreChange) => void): () => void;
  close(): Promise<void>;
}

/** Opens the store for this platform; Metro picks open.web.ts or open.native.ts. */
export type OpenLocalStore = () => Promise<LocalStore>;

/** A staged write, as the platform backends apply it. */
export type WriteOp =
  | { op: 'record'; collection: string; id: string; value: unknown }
  | { op: 'meta.set'; key: string; value: unknown }
  | { op: 'meta.delete'; key: string }
  | { op: 'outbox.add'; entry: OutboxEntry }
  | { op: 'outbox.remove'; id: string }
  | { op: 'outbox.reject'; id: string; reason: string };

/**
 * The small surface each platform implements (memory, IndexedDB, SQLite).
 * `commit` must apply all ops atomically. Values are stored as JSON.
 */
export interface StoreBackend {
  getRecord(collection: string, id: string): Promise<unknown>;
  listRecords(collection: string): Promise<unknown[]>;
  getMeta(key: string): Promise<unknown>;
  listOutbox(status: OutboxEntry['status'], limit?: number): Promise<OutboxEntry[]>;
  countOutbox(): Promise<OutboxCounts>;
  commit(ops: readonly WriteOp[]): Promise<void>;
  close(): Promise<void>;
}

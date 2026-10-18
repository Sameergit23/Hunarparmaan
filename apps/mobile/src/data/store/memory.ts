/**
 * An in-memory backend, for tests and as the type checker's view of
 * `openLocalStore`. It keeps values as JSON text, like the real backends, so
 * tests catch values that do not survive a round trip.
 */
import { createLocalStore } from './core';
import type { LocalStore, OutboxEntry, StoreBackend, WriteOp } from './types';

const parse = (text: string | undefined): unknown =>
  text === undefined ? undefined : JSON.parse(text);

export interface MemoryBackend extends StoreBackend {
  /** Make the next commit fail, to test that a failed transaction leaves nothing behind. */
  failNextCommit(error?: Error): void;
}

export function memoryBackend(): MemoryBackend {
  const records = new Map<string, Map<string, string>>();
  const meta = new Map<string, string>();
  const outbox = new Map<number, string>();
  let failure: Error | null = null;

  const entries = () =>
    [...outbox.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, text]) => JSON.parse(text) as OutboxEntry);

  function apply(ops: readonly WriteOp[]) {
    // Check everything first, so a bad op leaves nothing half-applied.
    const seqs = new Set(outbox.keys());
    const ids = new Set(entries().map((e) => e.id));
    for (const op of ops) {
      if (op.op !== 'outbox.add') continue;
      if (seqs.has(op.entry.seq) || ids.has(op.entry.id)) {
        throw new Error(`outbox already holds seq ${op.entry.seq} or id ${op.entry.id}`);
      }
      seqs.add(op.entry.seq);
      ids.add(op.entry.id);
    }
    for (const op of ops) {
      switch (op.op) {
        case 'record': {
          const collection = records.get(op.collection) ?? new Map<string, string>();
          collection.set(op.id, JSON.stringify(op.value));
          records.set(op.collection, collection);
          break;
        }
        case 'meta.set':
          meta.set(op.key, JSON.stringify(op.value));
          break;
        case 'meta.delete':
          meta.delete(op.key);
          break;
        case 'outbox.add':
          outbox.set(op.entry.seq, JSON.stringify(op.entry));
          break;
        case 'outbox.remove':
        case 'outbox.reject':
          for (const entry of entries()) {
            if (entry.id !== op.id) continue;
            if (op.op === 'outbox.remove') outbox.delete(entry.seq);
            else
              outbox.set(
                entry.seq,
                JSON.stringify({ ...entry, status: 'rejected', reason: op.reason }),
              );
          }
          break;
      }
    }
  }

  return {
    async getRecord(collection, id) {
      return parse(records.get(collection)?.get(id));
    },
    async listRecords(collection) {
      return [...(records.get(collection)?.values() ?? [])].map((text) => JSON.parse(text));
    },
    async getMeta(key) {
      return parse(meta.get(key));
    },
    async listOutbox(status, limit) {
      const matching = entries().filter((e) => e.status === status);
      return limit === undefined ? matching : matching.slice(0, limit);
    },
    async countOutbox() {
      const all = entries();
      return {
        pending: all.filter((e) => e.status === 'pending').length,
        rejected: all.filter((e) => e.status === 'rejected').length,
      };
    },
    async commit(ops) {
      if (failure) {
        const error = failure;
        failure = null;
        throw error;
      }
      apply(ops);
    },
    async close() {},
    failNextCommit(error = new Error('simulated commit failure')) {
      failure = error;
    },
  };
}

export function createMemoryStore(backend: StoreBackend = memoryBackend()): LocalStore {
  return createLocalStore(backend);
}

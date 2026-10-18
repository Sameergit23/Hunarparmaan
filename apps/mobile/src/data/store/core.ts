/**
 * The LocalStore, written once on top of a platform backend: a queue so
 * transactions run one at a time, staging so a transaction commits all its
 * writes or none, and change notifications after each commit.
 */
import type {
  LocalStore,
  OutboxEntry,
  StoreBackend,
  StoreChange,
  StoreTx,
  WriteOp,
} from './types';

/** Values cross the store as JSON, as they would on disk; this also stops aliasing. */
export const toJson = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

const recordKey = (collection: string, id: string) => `${collection}\u0000${id}`;

/** Runs tasks one after another, even when one fails. */
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <R>(task: () => Promise<R>): Promise<R> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

function describe(ops: readonly WriteOp[]): StoreChange {
  const collections = new Set<string>();
  const meta = new Set<string>();
  let outboxAdded = 0;
  let outboxChanged = false;
  for (const op of ops) {
    if (op.op === 'record') collections.add(op.collection);
    else if (op.op === 'meta.set' || op.op === 'meta.delete') meta.add(op.key);
    else {
      outboxChanged = true;
      if (op.op === 'outbox.add') outboxAdded += 1;
    }
  }
  return { collections: [...collections], meta: [...meta], outboxAdded, outboxChanged };
}

export function createLocalStore(backend: StoreBackend): LocalStore {
  const listeners = new Set<(change: StoreChange) => void>();
  const exclusive = serialQueue();

  async function commit(ops: readonly WriteOp[]) {
    if (ops.length === 0) return;
    await backend.commit(ops);
    const change = describe(ops);
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch {
        // A failing listener must not undo or block a commit that has happened.
      }
    }
  }

  const store: LocalStore = {
    async getRecord<T>(collection: string, id: string) {
      return (await backend.getRecord(collection, id)) as T | undefined;
    },
    async listRecords<T>(collection: string) {
      return (await backend.listRecords(collection)) as T[];
    },
    async getMeta<T>(key: string) {
      return (await backend.getMeta(key)) as T | undefined;
    },
    putRecord: (collection, id, value) =>
      exclusive(() => commit([{ op: 'record', collection, id, value: toJson(value) }])),
    setMeta: (key, value) =>
      exclusive(() => commit([{ op: 'meta.set', key, value: toJson(value) }])),
    deleteMeta: (key) => exclusive(() => commit([{ op: 'meta.delete', key }])),

    transaction<R>(work: (tx: StoreTx) => Promise<R>): Promise<R> {
      return exclusive(async () => {
        const ops: WriteOp[] = [];
        // Reads inside the transaction see its own staged writes.
        const records = new Map<string, unknown>();
        const meta = new Map<string, unknown>();
        let open = true;
        const stage = (op: WriteOp) => {
          if (!open) throw new Error('This transaction has ended; stage writes before it returns');
          ops.push(op);
        };
        const tx: StoreTx = {
          async getRecord<T>(collection: string, id: string) {
            const key = recordKey(collection, id);
            if (records.has(key)) return toJson(records.get(key)) as T | undefined;
            return (await backend.getRecord(collection, id)) as T | undefined;
          },
          async getMeta<T>(key: string) {
            if (meta.has(key)) return toJson(meta.get(key)) as T | undefined;
            return (await backend.getMeta(key)) as T | undefined;
          },
          putRecord(collection, id, value) {
            const json = toJson(value);
            stage({ op: 'record', collection, id, value: json });
            records.set(recordKey(collection, id), json);
          },
          setMeta(key, value) {
            const json = toJson(value);
            stage({ op: 'meta.set', key, value: json });
            meta.set(key, json);
          },
          deleteMeta(key) {
            stage({ op: 'meta.delete', key });
            meta.set(key, undefined);
          },
          enqueue(event) {
            const entry: OutboxEntry = {
              seq: event.seq,
              id: event.id,
              type: event.type,
              event: toJson(event),
              status: 'pending',
              queuedAt: new Date().toISOString(),
            };
            stage({ op: 'outbox.add', entry });
          },
          dequeue(id) {
            stage({ op: 'outbox.remove', id });
          },
          reject(id, reason) {
            stage({ op: 'outbox.reject', id, reason });
          },
        };
        try {
          const result = await work(tx);
          open = false;
          await commit(ops);
          return result;
        } finally {
          open = false;
        }
      });
    },

    outbox: {
      pending: (limit) => backend.listOutbox('pending', limit),
      rejected: () => backend.listOutbox('rejected'),
      counts: () => backend.countOutbox(),
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    close: () => exclusive(() => backend.close()),
  };
  return store;
}

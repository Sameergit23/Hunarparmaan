/**
 * The browser preview's store: IndexedDB through idb-keyval. It is for
 * development on a laptop only, never for real data (it is not encrypted).
 *
 * One object store holds everything under array keys, so one IndexedDB
 * transaction can write a record, its outbox event and the chain head together:
 * ['r', collection, id] for records, ['m', key] for meta, ['o', seq] for the outbox.
 */
import { createStore, promisifyRequest, type UseStore } from 'idb-keyval';
import { createLocalStore } from './core';
import type { OpenLocalStore, OutboxEntry, StoreBackend, WriteOp } from './types';

const DB_NAME = 'hunarpramaan';
const STORE_NAME = 'local';

// An empty array sorts after every string and number, so it closes a prefix range.
const AFTER_ALL: IDBValidKey = [];
const recordRange = (collection: string) =>
  IDBKeyRange.bound(['r', collection], ['r', collection, AFTER_ALL]);
const OUTBOX_RANGE = IDBKeyRange.bound(['o'], ['o', AFTER_ALL]);

function indexedDbBackend(use: UseStore): StoreBackend {
  const outboxEntries = (store: IDBObjectStore) =>
    promisifyRequest(store.getAll(OUTBOX_RANGE)) as Promise<OutboxEntry[]>;

  return {
    getRecord: (collection, id) => use('readonly', (s) => promisifyRequest(s.get(['r', collection, id]))),
    listRecords: (collection) =>
      use('readonly', (s) => promisifyRequest(s.getAll(recordRange(collection)))),
    getMeta: (key) => use('readonly', (s) => promisifyRequest(s.get(['m', key]))),
    async listOutbox(status, limit) {
      const all = await use('readonly', outboxEntries);
      const matching = all.filter((e) => e.status === status);
      return limit === undefined ? matching : matching.slice(0, limit);
    },
    async countOutbox() {
      const all = await use('readonly', outboxEntries);
      const pending = all.filter((e) => e.status === 'pending').length;
      return { pending, rejected: all.length - pending };
    },
    commit: (ops: readonly WriteOp[]) =>
      use('readwrite', async (s) => {
        // Only IndexedDB requests are awaited here, so the transaction stays open.
        const needsOutbox = ops.some((o) => o.op === 'outbox.remove' || o.op === 'outbox.reject');
        const outbox = needsOutbox ? await outboxEntries(s) : [];
        for (const op of ops) {
          switch (op.op) {
            case 'record':
              s.put(op.value, ['r', op.collection, op.id]);
              break;
            case 'meta.set':
              s.put(op.value, ['m', op.key]);
              break;
            case 'meta.delete':
              s.delete(['m', op.key]);
              break;
            case 'outbox.add':
              // add(), not put(): a second event with the same seq fails the whole commit.
              s.add(op.entry, ['o', op.entry.seq]);
              break;
            case 'outbox.remove':
            case 'outbox.reject':
              for (const entry of outbox.filter((e) => e.id === op.id)) {
                if (op.op === 'outbox.remove') s.delete(['o', entry.seq]);
                else s.put({ ...entry, status: 'rejected', reason: op.reason }, ['o', entry.seq]);
              }
              break;
          }
        }
        await promisifyRequest(s.transaction);
      }),
    async close() {},
  };
}

export const openLocalStore: OpenLocalStore = async () =>
  createLocalStore(indexedDbBackend(createStore(DB_NAME, STORE_NAME)));

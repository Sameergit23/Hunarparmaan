/**
 * The type checker's and the tests' view of `openLocalStore`: a memory store.
 * Metro never bundles this file for the app: it picks `open.web.ts` (IndexedDB)
 * for the browser preview and `open.native.ts` (SQLite with SQLCipher) for
 * Android. All three export the same `OpenLocalStore` signature.
 */
import { createMemoryStore } from './memory';
import type { OpenLocalStore } from './types';

export const openLocalStore: OpenLocalStore = async () => createMemoryStore();

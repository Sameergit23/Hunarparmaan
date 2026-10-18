import { device } from './schema';
import type { LocalDb } from './outbox';

/**
 * This phone's device id, made once with the database. A new database means a
 * new id, so a fresh hash chain never collides with one the server already has.
 */
export function ensureDeviceId(db: LocalDb, newDeviceId: () => string): string {
  const existing = db.select({ id: device.id }).from(device).limit(1).get();
  if (existing) return existing.id;
  const id = newDeviceId();
  db.insert(device).values({ id }).run();
  return id;
}

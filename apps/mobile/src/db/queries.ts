/** Read models for the screens. They read the local tables, never the outbox. */
import { desc } from 'drizzle-orm';
import type { LocalDb } from './outbox';
import { consents, declarations, workers } from './schema';

export interface WorkerRow {
  id: string;
  name: string;
  language: 'hi' | 'en';
  consented: boolean;
  declared: boolean;
}

const workerIds = (rows: { workerId: string }[]) => new Set(rows.map((row) => row.workerId));

export function workersOnPhone(db: LocalDb): WorkerRow[] {
  const consented = workerIds(db.select({ workerId: consents.workerId }).from(consents).all());
  const declared = workerIds(
    db.select({ workerId: declarations.workerId }).from(declarations).all(),
  );
  return db
    .select({ id: workers.id, name: workers.name, language: workers.language })
    .from(workers)
    .orderBy(desc(workers.registeredAt))
    .all()
    .map((w) => ({ ...w, consented: consented.has(w.id), declared: declared.has(w.id) }));
}

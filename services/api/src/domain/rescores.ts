import { eq } from 'drizzle-orm';
import type { RescoreRequest, SessionUser } from '@hunarpramaan/contracts';
import { rescoreTasks, rescores, sessions } from '../db/schema';
import { conflict, forbidden, notFound } from '../http/errors';
import type { Deps } from './context';

/** A master assessor's blind score for one sampled clip. Never their own session. */
export async function recordRescore(
  deps: Pick<Deps, 'db' | 'newId'>,
  user: SessionUser,
  input: RescoreRequest,
) {
  const [task] = await deps.db
    .select({ task: rescoreTasks, assessorId: sessions.assessorId, done: rescores.id })
    .from(rescoreTasks)
    .innerJoin(sessions, eq(sessions.id, rescoreTasks.sessionId))
    .leftJoin(rescores, eq(rescores.taskId, rescoreTasks.id))
    .where(eq(rescoreTasks.id, input.taskId));
  if (!task) throw notFound('Re-score task');
  if (task.assessorId === user.id) throw forbidden('You cannot re-score your own session');
  if (task.done) throw conflict('This clip was already re-scored');
  await deps.db
    .insert(rescores)
    .values({ id: deps.newId(), taskId: input.taskId, value: input.value, masterId: user.id });
}

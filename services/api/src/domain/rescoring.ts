import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { evidence, flags, rescoreTasks, scores } from '../db/schema';
import { aiConflicts } from './ai-results';
import type { Deps } from './context';

/**
 * FR-13: when a session is signed, a random share of its clips (10% by default)
 * and every flagged clip go to a master assessor for blind re-scoring.
 * A clip is flagged when the server raised a flag on it, when the assessor
 * gave a score that conflicted with an AI hint, or when a server-side AI check
 * raised a fault on a clip that got full marks.
 */
export async function sampleForRescoring(
  tx: Tx,
  deps: Pick<Deps, 'config' | 'random' | 'newId'>,
  sessionId: string,
): Promise<number> {
  const clips = await tx.select().from(evidence).where(eq(evidence.sessionId, sessionId));
  if (clips.length === 0) return 0;

  const clipIds = clips.map((c) => c.id);
  const flagged = new Set(
    (
      await tx
        .select({ evidenceId: flags.evidenceId })
        .from(flags)
        .where(inArray(flags.evidenceId, clipIds))
    ).map((f) => f.evidenceId),
  );
  const conflicted = await tx
    .select({ evidenceIds: scores.evidenceIds })
    .from(scores)
    .where(and(eq(scores.sessionId, sessionId), isNotNull(scores.conflictReason)));
  for (const row of conflicted) for (const id of row.evidenceIds) flagged.add(id);
  for (const id of await aiConflicts(tx, sessionId)) flagged.add(id);

  const tasks = clips.flatMap((clip) => {
    const reason = flagged.has(clip.id)
      ? ('flagged' as const)
      : deps.random() < deps.config.RESCORE_SAMPLE_RATE
        ? ('sample' as const)
        : null;
    return reason
      ? [
          {
            id: deps.newId(),
            evidenceId: clip.id,
            sessionId,
            criterionId: clip.criterionId,
            reason,
          },
        ]
      : [];
  });
  if (tasks.length > 0) await tx.insert(rescoreTasks).values(tasks).onConflictDoNothing();
  return tasks.length;
}

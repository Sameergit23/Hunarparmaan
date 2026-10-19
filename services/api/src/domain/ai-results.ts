/**
 * Server-side AI checks on evidence (README "AI workflow", step 3, and the
 * fallback in ADR 002: the safety-gear check runs on the server after sync).
 *
 * The queue worker sends each verified clip to the AI service and stores what
 * it suggests as `ai_result.stored`. Nothing here writes or changes a score
 * (rule 1): the system principal may only store AI results (AUTHORITY, ADR 006).
 * A raised check beside full marks sends the clip to a blind re-score by a
 * master assessor (FR-13), where a person decides.
 */
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { canPerform, type Actor, type AiResultView } from '@hunarpramaan/contracts';
import type { Db, Tx } from '../db/client';
import {
  aiResults,
  evidence,
  evidenceChecks,
  recommendations,
  rescoreTasks,
  scores,
  sessions,
  type StoredAiCheck,
} from '../db/schema';
import { clipKey } from '../storage/object-store';
import type { Deps } from './context';
import { qualificationLoader } from './packs';
import { standingScores } from './results';

const QUEUE_WORKER: Actor = { kind: 'system', service: 'queue-worker' };

export type VisionOutcome =
  'stored' | 'duplicate' | 'no_service' | 'no_checks' | 'not_verified' | 'missing';

async function readAll(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  return Buffer.concat(parts);
}

/** Job `evidence.vision`: ask the AI service about one verified clip and store its suggestions. */
export async function runVisionChecks(deps: Deps, evidenceId: string): Promise<VisionOutcome> {
  // The authority table is the source of truth (ADR 006); fail loudly if it ever changes.
  if (!canPerform(QUEUE_WORKER, 'ai_result.stored')) {
    throw new Error('the queue worker may not store AI results');
  }
  if (!deps.vision) return 'no_service';

  const [row] = await deps.db
    .select({ clip: evidence, session: sessions })
    .from(evidence)
    .innerJoin(sessions, eq(sessions.id, evidence.sessionId))
    .where(eq(evidence.id, evidenceId));
  if (!row) return 'missing';
  const [check] = await deps.db
    .select({ status: evidenceChecks.status })
    .from(evidenceChecks)
    .where(eq(evidenceChecks.evidenceId, evidenceId))
    .orderBy(desc(evidenceChecks.checkedAt), desc(evidenceChecks.id))
    .limit(1);
  // A clip whose bytes do not match its capture hash is not evidence: don't analyse it.
  if (check?.status !== 'verified') return 'not_verified';

  const qualification = await qualificationLoader(deps.db)(
    row.session.packVersion,
    row.session.nqrCode,
  );
  const criterion = qualification?.nos
    .flatMap((n) => n.criteria)
    .find((c) => c.id === row.clip.criterionId);
  const wanted = criterion?.aiChecks ?? [];
  if (wanted.length === 0) return 'no_checks';

  const chunks = await deps.store.read(clipKey(row.clip.sha256));
  if (!chunks) return 'missing';
  const response = await deps.vision.check(await readAll(chunks), row.clip.mimeType, wanted);
  const checks: StoredAiCheck[] = response.results.filter((r) => wanted.includes(r.check));
  if (checks.length === 0) return 'no_checks';

  return deps.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(aiResults)
      .values({
        id: deps.newId(),
        evidenceId,
        sessionId: row.session.id,
        criterionId: row.clip.criterionId,
        engine: response.engine,
        checks,
        unsupported: response.unsupported,
        createdAt: deps.now(),
      })
      .onConflictDoNothing()
      .returning({ id: aiResults.id });
    if (inserted.length === 0) return 'duplicate';
    // Signing already sampled the clips for re-scoring; a conflict found later joins them.
    const [signed] = await tx
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sessionId, row.session.id))
      .limit(1);
    if (signed && (await aiConflicts(tx, row.session.id)).has(evidenceId)) {
      await tx
        .insert(rescoreTasks)
        .values({
          id: deps.newId(),
          evidenceId,
          sessionId: row.session.id,
          criterionId: row.clip.criterionId,
          reason: 'flagged',
        })
        .onConflictDoNothing();
    }
    return 'stored';
  });
}

/**
 * Clips where a server-side check raised a fault but the standing score is
 * full marks: the assessor scored offline, before the check existed, so a
 * master assessor re-scores them blind (FR-13). The AI never changes the score.
 */
export async function aiConflicts(tx: Db | Tx, sessionId: string): Promise<Set<string>> {
  const results = await tx.select().from(aiResults).where(eq(aiResults.sessionId, sessionId));
  const raised = results.filter((r) => r.checks.some((c) => c.status === 'raised'));
  if (raised.length === 0) return new Set();
  const standing = standingScores(
    await tx.select().from(scores).where(eq(scores.sessionId, sessionId)),
  );
  return new Set(
    raised.filter((r) => standing.get(r.criterionId)?.value === 2).map((r) => r.evidenceId),
  );
}

/** Verified clips with no AI result yet (or all verified clips), for `ai:backfill`. */
export async function clipsToCheck(db: Db, all: boolean): Promise<string[]> {
  const verified = await db
    .selectDistinct({ id: evidenceChecks.evidenceId })
    .from(evidenceChecks)
    .where(eq(evidenceChecks.status, 'verified'));
  const ids = verified.map((v) => v.id);
  if (all || ids.length === 0) return ids;
  const done = new Set(
    (
      await db
        .selectDistinct({ id: aiResults.evidenceId })
        .from(aiResults)
        .where(inArray(aiResults.evidenceId, ids))
    ).map((r) => r.id),
  );
  return ids.filter((id) => !done.has(id));
}

/** The newest AI result per clip, grouped by criterion, for the session view. */
export async function aiResultsByCriterion(
  db: Db,
  sessionId: string,
): Promise<Map<string, AiResultView[]>> {
  const rows = await db
    .select()
    .from(aiResults)
    .where(eq(aiResults.sessionId, sessionId))
    .orderBy(asc(aiResults.createdAt), asc(aiResults.id));
  const newest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) newest.set(row.evidenceId, row);
  const byCriterion = new Map<string, AiResultView[]>();
  for (const row of newest.values()) {
    const view: AiResultView = {
      evidenceId: row.evidenceId,
      engine: row.engine,
      createdAt: row.createdAt.toISOString(),
      checks: row.checks.map((c) => ({
        check: c.check,
        status: c.status,
        confidence: c.confidence,
        reason: c.reason,
        frameTimes: c.frames.map((f) => f.timeSec),
      })),
    };
    byCriterion.set(row.criterionId, [...(byCriterion.get(row.criterionId) ?? []), view]);
  }
  return byCriterion;
}

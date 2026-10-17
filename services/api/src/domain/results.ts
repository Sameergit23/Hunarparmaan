/**
 * The server re-checks every signed result with the same scoring code the
 * phone used (rule 6), so a signature can only cover the maths it claims.
 */
import { eq } from 'drizzle-orm';
import type { Qualification, ScoreValue } from '@hunarpramaan/contracts';
import { EPSILON, qpResult, type QpResult } from '@hunarpramaan/scoring';
import type { Db, Tx } from '../db/client';
import type { MismatchParams } from './messages';
import { scores } from '../db/schema';

type ScoreRow = typeof scores.$inferSelect;

/**
 * The score that stands for each criterion: not superseded, and the newest
 * otherwise. UUIDv7 ids sort by creation time, so they break ties.
 */
export function standingScores(rows: readonly ScoreRow[]): Map<string, ScoreRow> {
  const superseded = new Set(rows.map((r) => r.supersedes).filter((id): id is string => !!id));
  const standing = new Map<string, ScoreRow>();
  for (const row of rows) {
    if (superseded.has(row.id)) continue;
    const current = standing.get(row.criterionId);
    const newer =
      !current ||
      row.recordedAt > current.recordedAt ||
      (row.recordedAt.getTime() === current.recordedAt.getTime() && row.id > current.id);
    if (newer) standing.set(row.criterionId, row);
  }
  return standing;
}

export interface Recomputed {
  result: QpResult;
  /** Problems with the score set itself, such as a score from another session. */
  problems: string[];
}

/**
 * Recompute a session's result from the exact score events a signature covers,
 * or from the standing scores when `scoreEventIds` is not given.
 */
export async function recomputeResult(
  tx: Db | Tx,
  sessionId: string,
  qualification: Qualification,
  scoreEventIds?: readonly string[],
): Promise<Recomputed> {
  const rows = await tx.select().from(scores).where(eq(scores.sessionId, sessionId));
  const problems: string[] = [];
  let chosen: ScoreRow[];

  if (scoreEventIds) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    chosen = [];
    for (const id of scoreEventIds) {
      const row = byId.get(id);
      if (!row) problems.push(`score ${id} is not part of this session`);
      else chosen.push(row);
    }
    const seen = new Set<string>();
    for (const row of chosen) {
      if (seen.has(row.criterionId)) problems.push(`two signed scores for ${row.criterionId}`);
      seen.add(row.criterionId);
    }
  } else {
    chosen = [...standingScores(rows).values()];
  }

  const values = new Map<string, ScoreValue>();
  const known = new Set(qualification.nos.flatMap((n) => n.criteria.map((c) => c.id)));
  for (const row of chosen) {
    if (!known.has(row.criterionId))
      problems.push(`${row.criterionId} is not in ${qualification.nqrCode}`);
    else values.set(row.criterionId, row.value as ScoreValue);
  }
  return { result: qpResult(qualification, values), problems };
}

/** Why a signed outcome and aggregate do not match the recomputed result, if they don't. */
export function resultMismatch(
  recomputed: Recomputed,
  signed: { outcome: 'pass' | 'fail'; aggregate: number },
): MismatchParams | null {
  const { result, problems } = recomputed;
  if (problems.length > 0) return { reason: 'scores' };
  if (result.status === 'incomplete')
    return { reason: 'incomplete', criteria: result.missing.join(', ') };
  if (result.status !== signed.outcome)
    return { reason: 'outcome', signed: signed.outcome, actual: result.status };
  if (Math.abs(result.value - signed.aggregate) > EPSILON * 1000) {
    return { reason: 'aggregate', signed: signed.aggregate, actual: result.value };
  }
  return null;
}

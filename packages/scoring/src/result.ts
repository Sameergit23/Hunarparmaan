import type { Qualification, ScoreValue } from '@hunarpramaan/contracts';
import { assertKnownCriteria, atLeast, weightedScore, type WeightedScore } from './weighted';

export type ResultStatus = 'incomplete' | 'pass' | 'fail';

export interface QpResult extends WeightedScore {
  /** `incomplete` until every criterion has a score; nothing can be signed before that. */
  status: ResultStatus;
  /** Criterion ids with no score yet, in QP order. */
  missing: string[];
  /** NOS below the QP's per-NOS floor, when it sets one. */
  failedNos: string[];
}

/**
 * Turns the assessor's 0/1/2 scores into the QP result with the same weighting
 * as coverage. A 1 earns half the criterion's marks: our design choice, to be
 * confirmed with the domain mentor (README "Turning scores into a result").
 */
export function qpResult(
  qualification: Qualification,
  scores: ReadonlyMap<string, ScoreValue>,
): QpResult {
  assertKnownCriteria(qualification, scores.keys());
  for (const [id, value] of scores) {
    if (value !== 0 && value !== 1 && value !== 2) {
      throw new RangeError(`score for ${id} must be 0, 1 or 2, got ${String(value)}`);
    }
  }

  const score = weightedScore(qualification, (c) => (scores.get(c.id) ?? 0) / 2);
  const missing = qualification.nos.flatMap((n) =>
    n.criteria.filter((c) => !scores.has(c.id)).map((c) => c.id),
  );

  const { aggregatePercent, minNosPercent } = qualification.passRule;
  const failedNos =
    minNosPercent === undefined
      ? []
      : score.nos.filter((n) => !atLeast(n.fraction * 100, minNosPercent)).map((n) => n.code);

  let status: ResultStatus;
  if (missing.length > 0) status = 'incomplete';
  else if (atLeast(score.value * 100, aggregatePercent) && failedNos.length === 0) status = 'pass';
  else status = 'fail';

  return { ...score, status, missing, failedNos };
}

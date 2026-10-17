import type { Qualification, Route, RoutingPolicy } from '@hunarpramaan/contracts';
import {
  EPSILON,
  assertKnownCriteria,
  atLeast,
  weightedScore,
  type WeightedScore,
} from './weighted';

export interface Coverage extends WeightedScore {
  /** Criterion ids the declaration covers, in QP order. */
  covered: string[];
  /** Criterion ids it does not cover, in QP order. */
  gaps: string[];
  /** NOS with at least one gap: the bridge module's content. */
  gapNos: string[];
}

/** How much of a QP a self-declaration covers, weighted by NOS weight and criterion marks. */
export function coverage(qualification: Qualification, coveredIds: Iterable<string>): Coverage {
  const coveredSet = new Set(coveredIds);
  assertKnownCriteria(qualification, coveredSet);

  const score = weightedScore(qualification, (c) => (coveredSet.has(c.id) ? 1 : 0));
  const covered: string[] = [];
  const gaps: string[] = [];
  const gapNos: string[] = [];
  for (const n of qualification.nos) {
    let hasGap = false;
    for (const c of n.criteria) {
      if (coveredSet.has(c.id)) {
        covered.push(c.id);
      } else {
        gaps.push(c.id);
        hasGap = true;
      }
    }
    if (hasGap) gapNos.push(n.code);
  }
  return { ...score, covered, gaps, gapNos };
}

export interface RouteDecision {
  route: Route;
  /** True inside the review band: a person checks the route before it stands. */
  needsReview: boolean;
}

/**
 * The 70% rule (FR-04): coverage at or above the threshold books a direct
 * assessment; below it, a bridge module on the gap NOS comes first. This is a
 * suggestion: the mobiliser confirms it and can override with a reason.
 */
export function suggestRoute(coverageValue: number, policy: RoutingPolicy): RouteDecision {
  if (!(coverageValue >= 0 && coverageValue <= 1 + EPSILON)) {
    throw new RangeError(`coverage must be between 0 and 1, got ${coverageValue}`);
  }
  const { low, high } = policy.reviewBand;
  return {
    route: atLeast(coverageValue, policy.routingThreshold) ? 'direct_assessment' : 'bridge_module',
    needsReview: atLeast(coverageValue, low) && atLeast(high, coverageValue),
  };
}

import type { Criterion, Qualification } from '@hunarpramaan/contracts';

/**
 * Tolerance for comparing a computed fraction with a threshold. Weights are
 * decimals, so a value that is exactly 0.70 on paper can come out as
 * 0.6999999999999999 in floating point. Anything within this of the
 * threshold counts as meeting it; 0.699 is still below 0.70.
 */
export const EPSILON = 1e-9;

export function atLeast(value: number, threshold: number): boolean {
  return value + EPSILON >= threshold;
}

export interface NosBreakdown {
  code: string;
  weight: number;
  /** Σ marks × credit over the NOS's criteria. */
  earnedMarks: number;
  totalMarks: number;
  /** earnedMarks / totalMarks, from 0 to 1. */
  fraction: number;
}

export interface WeightedScore {
  /** Σ over NOS of weight × fraction, from 0 to 1. */
  value: number;
  nos: NosBreakdown[];
}

/**
 * The one formula behind both coverage and the QP result (README "Core logic"):
 *
 *   score(Q) = Σ_{n ∈ Q} w_n · ( Σ_{c ∈ n} m_c · credit_c ) / ( Σ_{c ∈ n} m_c )
 *
 * `credit` gives each criterion a value from 0 to 1: covered or not for
 * coverage, score / 2 for the result.
 */
export function weightedScore(
  qualification: Qualification,
  credit: (criterion: Criterion) => number,
): WeightedScore {
  let value = 0;
  const nos = qualification.nos.map((n): NosBreakdown => {
    let earnedMarks = 0;
    let totalMarks = 0;
    for (const criterion of n.criteria) {
      const c = credit(criterion);
      if (!(c >= 0 && c <= 1)) {
        throw new RangeError(`credit for ${criterion.id} must be between 0 and 1, got ${c}`);
      }
      earnedMarks += criterion.marks * c;
      totalMarks += criterion.marks;
    }
    const fraction = earnedMarks / totalMarks;
    value += n.weight * fraction;
    return { code: n.code, weight: n.weight, earnedMarks, totalMarks, fraction };
  });
  return { value, nos };
}

/** Throw if any id is not a criterion of the qualification: that is a caller bug. */
export function assertKnownCriteria(qualification: Qualification, ids: Iterable<string>): void {
  const known = new Set(qualification.nos.flatMap((n) => n.criteria.map((c) => c.id)));
  for (const id of ids) {
    if (!known.has(id)) {
      throw new RangeError(`${qualification.nqrCode} has no criterion ${id}`);
    }
  }
}

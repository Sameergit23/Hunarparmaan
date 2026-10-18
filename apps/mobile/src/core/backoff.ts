/** Retry delays for the sync loop when a push fails (ADR 003: push in order, with back-off). */
export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
}

export const SYNC_BACKOFF: BackoffPolicy = { baseMs: 2_000, maxMs: 5 * 60_000 };

/**
 * Delay before the next try after `failures` failures in a row: doubling from
 * `baseMs` up to `maxMs`, with the second half random, so phones that lose
 * signal together at a venue do not all retry at the same moment.
 */
export function backoffDelay(
  failures: number,
  random: () => number = Math.random,
  policy: BackoffPolicy = SYNC_BACKOFF,
): number {
  if (failures <= 0) return 0;
  const ceiling = Math.min(policy.maxMs, policy.baseMs * 2 ** (failures - 1));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

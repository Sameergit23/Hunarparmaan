/**
 * Account lockout (ADR 010 "Sign-in hardening"). Every fifth wrong PIN in a row
 * locks the account: 15 minutes the first time, doubling each further time,
 * never more than an hour, so a typo never locks a worker out for the day.
 * A right PIN, or an admin's unlock, starts the count again.
 */
export const WRONG_PINS_PER_LOCK = 5;
export const FIRST_LOCK_MS = 15 * 60_000;
export const MAX_LOCK_MS = 60 * 60_000;

/** How long to lock after `failedPins` wrong PINs in a row; null when this one does not lock. */
export function lockAfter(failedPins: number): number | null {
  if (failedPins <= 0 || failedPins % WRONG_PINS_PER_LOCK !== 0) return null;
  const lockouts = failedPins / WRONG_PINS_PER_LOCK;
  return Math.min(FIRST_LOCK_MS * 2 ** (lockouts - 1), MAX_LOCK_MS);
}

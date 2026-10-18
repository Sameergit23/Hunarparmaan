/** Postgres error codes we act on. Drizzle wraps driver errors, so look at `cause` too. */
const PG = {
  uniqueViolation: '23505',
  restrictViolation: '23001',
} as const;

/** Class 23: the data broke a constraint (foreign key, unique, not null, check). */
const INTEGRITY_CLASS = '23';

function pgCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown) => pgCode(error) === PG.uniqueViolation;
/** Any constraint violation: the event's data does not fit, not a server fault. */
export const isIntegrityViolation = (error: unknown) =>
  pgCode(error)?.startsWith(INTEGRITY_CLASS) ?? false;
/** Raised by the append-only trigger (migration 0001). */
export const isAppendOnlyViolation = (error: unknown) => pgCode(error) === PG.restrictViolation;

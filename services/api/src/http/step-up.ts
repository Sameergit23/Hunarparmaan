/**
 * Step-up (FR-30, TRD D-2): every admin write carries the admin's PIN, and it
 * is checked again here, after the role and before anything else. A missing
 * PIN changes nothing and costs nothing; a wrong one counts towards the
 * admin's own lockout, like a wrong PIN at sign-in.
 */
import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { Pin } from '@hunarpramaan/contracts';
import { verifySecret } from '../auth/secrets';
import { users } from '../db/schema';
import { lockedUntil, recordWrongPin } from '../domain/auth';
import type { Deps } from '../domain/context';
import { currentUser } from './auth';
import { HttpError, unauthorized } from './errors';

/** 403, not 401: the admin is signed in, and apps take 401 as "sign in again". */
const stepUpRequired = () =>
  new HttpError(403, 'step_up_required', 'Enter your PIN to confirm this action');

export function requireStepUp(deps: Deps): RequestHandler {
  return async (req, res, next) => {
    const pin = (req.body as { pin?: unknown } | undefined)?.pin;
    if (typeof pin !== 'string' || !Pin.safeParse(pin).success) return next(stepUpRequired());
    const [account] = await deps.db
      .select()
      .from(users)
      .where(eq(users.id, currentUser(res).id));
    if (!account) return next(unauthorized());
    const now = deps.now();
    const until = lockedUntil(deps, account, now);
    if (until) {
      return next(
        new HttpError(423, 'account_locked', 'Too many wrong PINs; try again later', [
          `until:${until.toISOString()}`,
        ]),
      );
    }
    if (await verifySecret(pin, account.pinHash)) return next();
    await recordWrongPin(deps, account.id);
    next(stepUpRequired());
  };
}

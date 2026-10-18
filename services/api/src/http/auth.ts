/**
 * Role checks. Rule 1: every write is checked against AUTHORITY from
 * @hunarpramaan/contracts, and every read against READ_ACCESS. Handlers never
 * compare roles themselves.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  canPerform,
  canRead,
  type Action,
  type ReadScope,
  type SessionUser,
} from '@hunarpramaan/contracts';
import { eq } from 'drizzle-orm';
import type { TokenIssuer } from '../auth/tokens';
import { organisations, users } from '../db/schema';
import {
  accountDeactivated,
  accountStatus,
  organisationSuspended,
  phonesOf,
} from '../domain/accounts';
import type { Deps } from '../domain/context';
import { HttpError, forbidden, unauthorized } from './errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: SessionUser;
    }
  }
}

/**
 * What a deactivated account's phone may still do while it drains: send what
 * it recorded, its clips, and fetch the checks of those clips (ADR 010 point 8).
 * Paths are below `/v1`, where `authenticate` is mounted.
 */
const DRAIN_ROUTES: readonly [method: string, path: RegExp][] = [
  ['POST', /^\/sync\/push$/],
  ['GET', /^\/sync\/pull$/],
  ['PUT', /^\/evidence\/[^/]+\/content$/],
  ['POST', /^\/evidence\/[^/]+\/complete$/],
];
const isDrainRoute = (req: Request) =>
  DRAIN_ROUTES.some(([method, path]) => req.method === method && path.test(req.path));

/**
 * A valid token is not enough (ADR 010: accounts are checked on every request):
 * its version and organisation must still be the account's, so a PIN change or
 * reset ends every older sign-in; the organisation must be active; and the
 * account must be active, except that a deactivated account's phone may still
 * sync while it drains.
 */
export function authenticate(tokens: TokenIssuer, deps: Pick<Deps, 'db' | 'now'>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) return next(unauthorized());
    const verified = await tokens.verify(header.slice('Bearer '.length));
    if (!verified) return next(unauthorized('Your sign-in has expired; sign in again'));
    const [account] = await deps.db
      .select({ user: users, organisationStatus: organisations.status })
      .from(users)
      .innerJoin(organisations, eq(organisations.id, users.organisationId))
      .where(eq(users.id, verified.user.id));
    if (
      !account ||
      account.user.tokenVersion !== verified.tokenVersion ||
      account.user.organisationId !== verified.user.organisationId
    ) {
      return next(new HttpError(401, 'token_revoked', 'Your sign-in has ended; sign in again'));
    }
    if (account.organisationStatus !== 'active') return next(organisationSuspended());
    if (account.user.status !== 'active') {
      const phones = (await phonesOf(deps.db, [account.user.id])).get(account.user.id) ?? [];
      const status = accountStatus(account.user, phones, deps.now());
      if (status !== 'draining' || !isDrainRoute(req)) return next(accountDeactivated());
    }
    res.locals.user = verified.user;
    next();
  };
}

export function currentUser(res: Response): SessionUser {
  const user = res.locals.user;
  if (!user) throw unauthorized();
  return user;
}

/** Allow the request only if the user's role may perform `action`. */
export function requireAction(action: Action): RequestHandler {
  return (_req, res, next) => {
    const user = currentUser(res);
    if (!canPerform({ kind: 'user', userId: user.id, role: user.role }, action)) {
      return next(forbidden(`${user.role} may not perform ${action}`));
    }
    next();
  };
}

/** Allow the request only if the user's role may read one of `scopes`. */
export function requireRead(...scopes: [ReadScope, ...ReadScope[]]): RequestHandler {
  return (_req, res, next) => {
    const user = currentUser(res);
    if (!scopes.some((scope) => canRead(user.role, scope))) {
      return next(forbidden(`${user.role} may not read ${scopes.join(' or ')}`));
    }
    next();
  };
}

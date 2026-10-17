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
import type { TokenIssuer } from '../auth/tokens';
import { forbidden, unauthorized } from './errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: SessionUser;
    }
  }
}

export function authenticate(tokens: TokenIssuer): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) return next(unauthorized());
    const user = await tokens.verify(header.slice('Bearer '.length));
    if (!user) return next(unauthorized('Your sign-in has expired; sign in again'));
    res.locals.user = user;
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

export function requireRead(scope: ReadScope): RequestHandler {
  return (_req, res, next) => {
    const user = currentUser(res);
    if (!canRead(user.role, scope)) return next(forbidden(`${user.role} may not read ${scope}`));
    next();
  };
}

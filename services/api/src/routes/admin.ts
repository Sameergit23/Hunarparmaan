/** Admin routes (ADR 010): people and phones, never a decision. HTTP only. */
import { Router } from 'express';
import { CreateInviteRequest, type CreateInviteResponse } from '@hunarpramaan/contracts';
import { createInvite } from '../domain/admin';
import type { Deps } from '../domain/context';
import { currentUser, requireAction } from '../http/auth';
import { parse } from '../http/validate';

export function adminRoutes(deps: Deps) {
  const router = Router();

  // Which roles each admin may invite is GRANTABLE_ROLES; the domain checks it.
  router.post('/v1/admin/invites', requireAction('account.invited'), async (req, res) => {
    const input = parse(CreateInviteRequest, req.body);
    const body: CreateInviteResponse = await createInvite(deps, currentUser(res), input);
    res.status(201).json(body);
  });

  return router;
}

/**
 * Admin routes (ADR 010, TRD section 5): people and phones, never a decision.
 * HTTP only. Every write runs `requireAction`, then the PIN (`requireStepUp`),
 * then the domain's scope and rules, in one transaction with its log entry.
 */
import { Router } from 'express';
import {
  AccountListQuery,
  AdminLogQuery,
  CreateInviteRequest,
  DeactivateRequest,
  DeviceListQuery,
  InviteListQuery,
  PinResetRequest,
  ReactivateRequest,
  RevokeDeviceRequest,
  UnlockRequest,
  type AccountDetail,
  type CreateInviteResponse,
  type DeviceDetail,
  type PinResetResponse,
} from '@hunarpramaan/contracts';
import { createInvite } from '../domain/admin';
import {
  deactivateAccount,
  reactivateAccount,
  resetAccountPin,
  revokeDevice,
  unlockAccount,
} from '../domain/admin-actions';
import { adminScope } from '../domain/admin-scope';
import {
  accountDetail,
  adminLog,
  deviceDetail,
  governanceReport,
  listAccounts,
  listDevices,
  listInvites,
  listOrganisations,
  verifyLog,
} from '../domain/admin-views';
import type { Deps } from '../domain/context';
import { currentUser, requireAction, requireRead } from '../http/auth';
import { idParam } from '../http/params';
import { requireStepUp } from '../http/step-up';
import { parse } from '../http/validate';
import { z } from 'zod';

const deviceParam = (id: unknown) => parse(z.string().trim().min(1).max(100), id);

export function adminRoutes(deps: Deps) {
  const router = Router();
  const { db } = deps;
  const stepUp = requireStepUp(deps);
  const scopeOf = (res: Parameters<typeof currentUser>[0]) => adminScope(currentUser(res));

  // --- Reads -----------------------------------------------------------------
  router.get('/v1/admin/organisations', requireRead('accounts.read'), async (_req, res) => {
    res.json(await listOrganisations(db, scopeOf(res)));
  });

  router.get('/v1/admin/accounts', requireRead('accounts.read'), async (req, res) => {
    const query = parse(AccountListQuery, req.query);
    res.json(await listAccounts(db, scopeOf(res), query, deps.now()));
  });

  router.get('/v1/admin/accounts/:id', requireRead('accounts.read'), async (req, res) => {
    res.json(await accountDetail(db, scopeOf(res), idParam(req), deps.now()));
  });

  router.get('/v1/admin/invites', requireRead('accounts.read'), async (req, res) => {
    const query = parse(InviteListQuery, req.query);
    res.json(await listInvites(db, scopeOf(res), query, deps.now()));
  });

  router.get('/v1/admin/devices', requireRead('devices.read'), async (req, res) => {
    const query = parse(DeviceListQuery, req.query);
    res.json(await listDevices(db, scopeOf(res), query, deps.now()));
  });

  router.get('/v1/admin/devices/:id', requireRead('devices.read'), async (req, res) => {
    res.json(await deviceDetail(db, scopeOf(res), deviceParam(req.params.id)));
  });

  router.get('/v1/admin/log', requireRead('admin_log.read'), async (req, res) => {
    const query = parse(AdminLogQuery, req.query);
    res.json(await adminLog(db, scopeOf(res), query));
  });

  // NCVET checks the chain too, and sees counts only (FR-32).
  router.get(
    '/v1/admin/log/verify',
    requireRead('admin_log.read', 'governance_log.read'),
    async (_req, res) => {
      res.json(await verifyLog(db, deps.now()));
    },
  );

  router.get('/v1/governance', requireRead('governance_log.read'), async (_req, res) => {
    res.json(await governanceReport(db));
  });

  // --- Writes ----------------------------------------------------------------
  // Which roles each admin may invite is GRANTABLE_ROLES; the domain checks it.
  router.post('/v1/admin/invites', requireAction('account.invited'), stepUp, async (req, res) => {
    const { pin: _, ...input } = parse(CreateInviteRequest, req.body);
    const body: CreateInviteResponse = await createInvite(deps, currentUser(res), input);
    res.status(201).json(body);
  });

  const accountWrite = <B extends { reason: string }>(
    path: string,
    action: Parameters<typeof requireAction>[0],
    schema: z.ZodType<B & { pin: string }>,
    perform: (
      id: string,
      reason: B['reason'],
      user: ReturnType<typeof currentUser>,
    ) => Promise<unknown>,
  ) =>
    router.post(path, requireAction(action), stepUp, async (req, res) => {
      const { reason } = parse(schema, req.body);
      const id = idParam(req);
      const user = currentUser(res);
      await perform(id, reason, user);
      const body: AccountDetail = await accountDetail(db, adminScope(user), id, deps.now());
      res.json(body);
    });

  accountWrite(
    '/v1/admin/accounts/:id/deactivate',
    'account.deactivated',
    DeactivateRequest,
    (id, reason, user) => deactivateAccount(deps, user, id, reason),
  );
  accountWrite(
    '/v1/admin/accounts/:id/reactivate',
    'account.reactivated',
    ReactivateRequest,
    (id, reason, user) => reactivateAccount(deps, user, id, reason),
  );
  accountWrite(
    '/v1/admin/accounts/:id/unlock',
    'account.unlocked',
    UnlockRequest,
    (id, reason, user) => unlockAccount(deps, user, id, reason),
  );

  router.post(
    '/v1/admin/accounts/:id/pin-reset',
    requireAction('account.pin_reset'),
    stepUp,
    async (req, res) => {
      const { reason } = parse(PinResetRequest, req.body);
      const body: PinResetResponse = await resetAccountPin(
        deps,
        currentUser(res),
        idParam(req),
        reason,
      );
      res.status(201).json(body);
    },
  );

  router.post(
    '/v1/admin/devices/:id/revoke',
    requireAction('device.revoked'),
    stepUp,
    async (req, res) => {
      const { status, reason } = parse(RevokeDeviceRequest, req.body);
      const id = deviceParam(req.params.id);
      const user = currentUser(res);
      await revokeDevice(deps, user, id, { status, reason });
      const body: DeviceDetail = await deviceDetail(db, adminScope(user), id);
      res.json(body);
    },
  );

  return router;
}

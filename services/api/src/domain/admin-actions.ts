/**
 * Admin actions on accounts and phones (FR-23 to FR-28, TRD section 6). The
 * route has already checked the token, `AUTHORITY` and the admin's PIN. Here,
 * in order: scope (outside it is "not found"), the rules (no self-action, never
 * the last admin, only the issuer reactivates), then one transaction that
 * changes the state and appends the admin-log entry, or does neither.
 */
import { randomInt } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  AdminRole,
  type AdminReasonFor,
  type PinResetResponse,
  type RevokeDeviceRequest,
  type SessionUser,
} from '@hunarpramaan/contracts';
import { hashSecret } from '../auth/secrets';
import type { Tx } from '../db/client';
import { accountInvites, devices, renewalKeys, users } from '../db/schema';
import { HttpError, conflict, notFound } from '../http/errors';
import { currentStatus } from './accounts';
import { appendAdminEvent, assertUnderCodeLimit } from './admin';
import { adminScope, canActOn, canSee, type AdminScope } from './admin-scope';
import type { Deps } from './context';

const HOUR = 60 * 60_000;
export const PIN_RESET_TTL_MS = 24 * HOUR;

const selfAction = () =>
  new HttpError(409, 'self_action', 'You cannot change your own account here');
const lastAdmin = () =>
  new HttpError(409, 'last_admin', 'This is the last active admin of the organisation');
const notIssuer = () =>
  new HttpError(
    403,
    'not_issuer',
    'Only the admin who deactivated this account, or the platform admin, can bring it back',
  );

/** The target account, locked for this transaction, if this admin may act on it. */
async function targetAccount(tx: Tx, scope: AdminScope, id: string) {
  const [account] = await tx.select().from(users).where(eq(users.id, id)).for('update');
  // Seen but not actionable, such as an assessor for the platform admin, reads as missing too.
  if (!account || !canActOn(scope, account)) throw notFound('Account');
  if (account.id === scope.adminId) throw selfAction();
  return account;
}

/**
 * Deactivate (FR-23): the account drains. Its other requests stop at once, it
 * can't sign in, and its phones still sync what they recorded, flagged for
 * review. The token version is left alone so those phones can keep renewing;
 * reactivation raises it.
 */
export async function deactivateAccount(
  deps: Deps,
  admin: SessionUser,
  accountId: string,
  reason: AdminReasonFor<'account.deactivated'>,
) {
  const scope = adminScope(admin);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const account = await targetAccount(tx, scope, accountId);
    if ((await currentStatus(tx, account, now)) !== 'active') {
      throw conflict('This account is already deactivated');
    }
    if (AdminRole.safeParse(account.role).success) {
      // Lock the organisation's active admins, so two admins can't remove each other at once.
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.organisationId, account.organisationId),
            inArray(users.role, AdminRole.options),
            eq(users.status, 'active'),
          ),
        )
        .for('update');
      if (!admins.some((a) => a.id !== account.id)) throw lastAdmin();
    }
    await tx
      .update(users)
      .set({ status: 'draining', statusChangedAt: now, statusChangedBy: admin.id })
      .where(eq(users.id, account.id));
    await appendAdminEvent(tx, deps, {
      type: 'account.deactivated',
      actorId: admin.id,
      organisationId: account.organisationId,
      subjectKind: 'account',
      subjectId: account.id,
      reason,
    });
  });
}

/**
 * Reactivate (FR-24), while the account drains, by whoever deactivated it or
 * the platform admin. Every older sign-in stays ended: the person signs in
 * again with the SMS code and their PIN.
 */
export async function reactivateAccount(
  deps: Deps,
  admin: SessionUser,
  accountId: string,
  reason: AdminReasonFor<'account.reactivated'>,
) {
  const scope = adminScope(admin);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const account = await targetAccount(tx, scope, accountId);
    const status = await currentStatus(tx, account, now);
    if (status !== 'draining') {
      throw conflict(
        status === 'closed'
          ? 'A closed account cannot come back; invite the person again'
          : 'This account is active',
      );
    }
    if (account.statusChangedBy !== admin.id && scope.level !== 'governance') throw notIssuer();
    await tx
      .update(users)
      .set({
        status: 'active',
        statusChangedAt: now,
        statusChangedBy: admin.id,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, account.id));
    await appendAdminEvent(tx, deps, {
      type: 'account.reactivated',
      actorId: admin.id,
      organisationId: account.organisationId,
      subjectKind: 'account',
      subjectId: account.id,
      reason,
    });
  });
}

/** Unlock (FR-25): the lockout ends and the wrong-PIN count starts again. The PIN is untouched. */
export async function unlockAccount(
  deps: Deps,
  admin: SessionUser,
  accountId: string,
  reason: AdminReasonFor<'account.unlocked'>,
) {
  const scope = adminScope(admin);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const account = await targetAccount(tx, scope, accountId);
    if (!account.lockedUntil || account.lockedUntil <= now) {
      throw conflict('This account is not locked');
    }
    await tx
      .update(users)
      .set({ lockedUntil: null, failedPinAttempts: 0, lockouts: 0 })
      .where(eq(users.id, account.id));
    await appendAdminEvent(tx, deps, {
      type: 'account.unlocked',
      actorId: admin.id,
      organisationId: account.organisationId,
      subjectKind: 'account',
      subjectId: account.id,
      reason,
    });
  });
}

/**
 * PIN reset (FR-26): an 8-digit code, valid 24 hours, shown to the admin once.
 * Every sign-in the person has ends now; they set a new PIN with the SMS code
 * and the reset code (`acceptPinReset`). The admin never sees the PIN.
 */
export async function resetAccountPin(
  deps: Deps,
  admin: SessionUser,
  accountId: string,
  reason: AdminReasonFor<'account.pin_reset'>,
): Promise<PinResetResponse> {
  const scope = adminScope(admin);
  const now = deps.now();
  const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
  const codeHash = await hashSecret(code);
  const expiresAt = new Date(now.getTime() + PIN_RESET_TTL_MS);
  await deps.db.transaction(async (tx) => {
    const account = await targetAccount(tx, scope, accountId);
    if ((await currentStatus(tx, account, now)) !== 'active') {
      throw conflict('This account is deactivated');
    }
    await assertUnderCodeLimit(tx, admin.id, now);
    await tx
      .update(accountInvites)
      .set({ replacedAt: now })
      .where(
        and(
          eq(accountInvites.kind, 'pin_reset'),
          eq(accountInvites.userId, account.id),
          isNull(accountInvites.acceptedAt),
          isNull(accountInvites.replacedAt),
        ),
      );
    const id = deps.newId();
    await tx.insert(accountInvites).values({
      id,
      kind: 'pin_reset',
      userId: account.id,
      phone: account.phone,
      name: account.name,
      role: account.role,
      organisationId: account.organisationId,
      codeHash,
      invitedBy: admin.id,
      createdAt: now,
      expiresAt,
    });
    await tx
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, account.id));
    await tx
      .update(renewalKeys)
      .set({ revokedAt: now })
      .where(and(eq(renewalKeys.userId, account.id), isNull(renewalKeys.revokedAt)));
    await appendAdminEvent(tx, deps, {
      type: 'account.pin_reset',
      actorId: admin.id,
      organisationId: account.organisationId,
      subjectKind: 'account',
      subjectId: account.id,
      reason,
    });
  });
  return { code, expiresAt: expiresAt.toISOString() };
}

/**
 * Revoke a phone (FR-28). Lost: every later push and renewal is refused, and
 * its renewal keys end. Retired or replaced: it drains. A retired phone can
 * still be reported lost; nothing goes back to "registered".
 */
export async function revokeDevice(
  deps: Deps,
  admin: SessionUser,
  deviceId: string,
  input: Pick<RevokeDeviceRequest, 'status' | 'reason'>,
) {
  const scope = adminScope(admin);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ device: devices, owner: users })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .where(eq(devices.id, deviceId))
      .for('update', { of: devices });
    // Organisation admins for their own phones; the platform admin for any phone.
    if (!row || !canSee(scope, row.owner)) throw notFound('Phone');
    const { device, owner } = row;
    if (device.userId === admin.id) throw selfAction();
    const allowed = device.status === 'registered' || input.status === 'lost';
    if (!allowed || device.status === 'lost') {
      throw conflict(`This phone is already ${device.status}`);
    }
    await tx
      .update(devices)
      .set({
        status: input.status,
        statusChangedAt: now,
        statusChangedBy: admin.id,
        revokedAt: device.revokedAt ?? now,
      })
      .where(eq(devices.id, device.id));
    if (input.status === 'lost') {
      await tx
        .update(renewalKeys)
        .set({ revokedAt: now })
        .where(and(eq(renewalKeys.deviceId, device.id), isNull(renewalKeys.revokedAt)));
    }
    await appendAdminEvent(tx, deps, {
      type: 'device.revoked',
      actorId: admin.id,
      organisationId: owner.organisationId,
      subjectKind: 'device',
      subjectId: device.id,
      reason: input.reason,
    });
  });
}

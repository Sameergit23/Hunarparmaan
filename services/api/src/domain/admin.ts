/**
 * Admin actions (ADR 010): admins manage people, organisations and phones, and
 * never decide. Every action goes into the admin log, which is append-only and
 * hash-chained with `@hunarpramaan/audit`, like a phone's events, and holds ids
 * and reason codes only, never a name or a phone number.
 */
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { seal, verifyChain, type ChainLink, type VerifyResult } from '@hunarpramaan/audit';
import {
  canGrant,
  type AdminActionType,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type SessionUser,
} from '@hunarpramaan/contracts';
import { hashSecret } from '../auth/secrets';
import type { Db, Tx } from '../db/client';
import { accountInvites, adminEvents, users } from '../db/schema';
import { HttpError } from '../http/errors';
import { normalisePhone, phoneInUse } from './auth';
import type { Deps } from './context';

/** The admin log is one chain for the whole server. */
export const ADMIN_CHAIN = 'admin-log';
export const INVITE_TTL_MS = 72 * 60 * 60_000;

/** Why an admin acted. Codes, not free text, so the log never holds personal data. */
export type AdminReason = 'new_staff';

/** One entry exactly as hashed into the chain. */
export interface AdminLogEntry extends ChainLink {
  id: string;
  type: AdminActionType;
  actorId: string;
  organisationId: string;
  subjectId: string;
  reason: AdminReason;
  occurredAt: string;
}

/** Append an admin action to the log, inside the transaction that performs it. */
export async function appendAdminEvent(
  tx: Tx,
  deps: Pick<Deps, 'newId' | 'now'>,
  entry: Pick<AdminLogEntry, 'type' | 'actorId' | 'organisationId' | 'subjectId' | 'reason'>,
): Promise<AdminLogEntry> {
  // One writer at a time, so two admins never fork the chain.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admin_events'))`);
  const [last] = await tx.select().from(adminEvents).orderBy(desc(adminEvents.seq)).limit(1);
  const prev: ChainLink | null = last
    ? { deviceId: ADMIN_CHAIN, seq: last.seq, prevHash: last.prevHash, hash: last.hash }
    : null;
  const sealed = seal<AdminLogEntry>(prev, {
    deviceId: ADMIN_CHAIN,
    id: deps.newId(),
    ...entry,
    occurredAt: deps.now().toISOString(),
  });
  await tx.insert(adminEvents).values({
    id: sealed.id,
    seq: sealed.seq,
    type: sealed.type,
    actorId: sealed.actorId,
    organisationId: sealed.organisationId,
    subjectId: sealed.subjectId,
    reason: sealed.reason,
    occurredAt: sealed.occurredAt,
    prevHash: sealed.prevHash,
    hash: sealed.hash,
  });
  return sealed;
}

/** Re-check the whole admin log against its hashes, from the first entry. */
export async function verifyAdminLog(db: Db): Promise<VerifyResult> {
  const rows = await db.select().from(adminEvents).orderBy(asc(adminEvents.seq));
  const entries: AdminLogEntry[] = rows.map((row) => ({
    deviceId: ADMIN_CHAIN,
    seq: row.seq,
    prevHash: row.prevHash,
    hash: row.hash,
    id: row.id,
    type: row.type,
    actorId: row.actorId,
    organisationId: row.organisationId,
    subjectId: row.subjectId,
    reason: row.reason as AdminReason,
    occurredAt: row.occurredAt,
  }));
  return verifyChain(entries);
}

/**
 * POST /v1/admin/invites. The admin may invite only roles in GRANTABLE_ROLES,
 * into their own organisation. The code is returned once, for the admin to
 * pass on; it is never sent by SMS. A newer invite replaces an older one for
 * the same number. `options.code` fixes the code, for the demo seed only.
 */
export async function createInvite(
  deps: Deps,
  admin: SessionUser,
  input: CreateInviteRequest,
  options: { code?: string } = {},
): Promise<CreateInviteResponse> {
  if (!canGrant(admin.role, input.role)) {
    throw new HttpError(403, 'role_not_grantable', `${admin.role} may not invite a ${input.role}`);
  }
  const phone = normalisePhone(input.phone);
  const now = deps.now();
  const code = options.code ?? String(randomInt(0, 100_000_000)).padStart(8, '0');
  const codeHash = await hashSecret(code);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const id = deps.newId();
  await deps.db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone));
    if (existing) throw phoneInUse();
    await tx
      .update(accountInvites)
      .set({ replacedAt: now })
      .where(
        and(
          eq(accountInvites.phone, phone),
          isNull(accountInvites.acceptedAt),
          isNull(accountInvites.replacedAt),
        ),
      );
    await tx.insert(accountInvites).values({
      id,
      phone,
      name: input.name,
      role: input.role,
      organisationId: admin.organisationId,
      codeHash,
      invitedBy: admin.id,
      createdAt: now,
      expiresAt,
    });
    await appendAdminEvent(tx, deps, {
      type: 'account.invited',
      actorId: admin.id,
      organisationId: admin.organisationId,
      subjectId: id,
      reason: 'new_staff',
    });
  });
  return { inviteId: id, code, expiresAt: expiresAt.toISOString() };
}

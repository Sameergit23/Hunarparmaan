/**
 * Admin actions (ADR 010): admins manage people, organisations and phones, and
 * never decide. Every action goes into the admin log, which is append-only and
 * hash-chained with `@hunarpramaan/audit`, like a phone's events, and holds ids
 * and reason codes only, never a name or a phone number.
 */
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { seal, verifyChain, type ChainLink, type VerifyResult } from '@hunarpramaan/audit';
import {
  ADMIN_CODES_PER_HOUR,
  Phone,
  SCOPE_BY_ROLE,
  canGrant,
  canHold,
  reasonFits,
  type AdminActionType,
  type AdminReasonCode,
  type AdminReasonFor,
  type AdminSubjectKind,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type Role,
  type SessionUser,
} from '@hunarpramaan/contracts';
import { hashSecret } from '../auth/secrets';
import type { Db, Tx } from '../db/client';
import { accountInvites, adminEvents, organisations, users } from '../db/schema';
import { HttpError, notFound } from '../http/errors';
import { openAccountByPhone } from './accounts';
import { normalisePhone, phoneInUse } from './auth';
import type { Deps } from './context';
import { PILOT_ORGANISATIONS, findOrganisation } from './organisations';

/** The admin log is one chain for the whole server. */
export const ADMIN_CHAIN = 'admin-log';
export const INVITE_TTL_MS = 72 * 60 * 60_000;

/**
 * One entry exactly as hashed into the chain (TRD D-7: this shape is fixed
 * before the log holds real entries). Ids and reason codes only, never a name,
 * a phone number or free text (ADR 011).
 */
export interface AdminLogEntry extends ChainLink {
  id: string;
  type: AdminActionType;
  actorId: string;
  organisationId: string;
  subjectKind: AdminSubjectKind;
  subjectId: string;
  reason: AdminReasonCode;
  occurredAt: string;
}

export type NewAdminEvent = Pick<
  AdminLogEntry,
  'type' | 'actorId' | 'organisationId' | 'subjectKind' | 'subjectId' | 'reason'
>;

/** Append an admin action to the log, inside the transaction that performs it. */
export async function appendAdminEvent(
  tx: Tx,
  deps: Pick<Deps, 'newId' | 'now'>,
  entry: NewAdminEvent,
): Promise<AdminLogEntry> {
  if (!reasonFits(entry.type, entry.reason)) {
    throw new Error(`${entry.reason} is not a reason for ${entry.type}`);
  }
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
    subjectKind: sealed.subjectKind,
    subjectId: sealed.subjectId,
    reason: sealed.reason,
    occurredAt: sealed.occurredAt,
    prevHash: sealed.prevHash,
    hash: sealed.hash,
  });
  return sealed;
}

const HOUR = 60 * 60_000;

/** At most 30 invites and PIN resets by one admin in an hour (TRD section 5.2). */
export async function assertUnderCodeLimit(tx: Tx, adminId: string, now: Date) {
  const since = new Date(now.getTime() - HOUR).toISOString();
  const recent = await tx
    .select({ occurredAt: adminEvents.occurredAt })
    .from(adminEvents)
    .where(
      and(
        eq(adminEvents.actorId, adminId),
        inArray(adminEvents.type, ['account.invited', 'account.pin_reset']),
      ),
    );
  if (recent.filter((r) => r.occurredAt >= since).length >= ADMIN_CODES_PER_HOUR) {
    throw new HttpError(429, 'rate_limited', 'Too many invites and PIN resets in an hour', [], {
      'Retry-After': String(HOUR / 1000),
    });
  }
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
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    reason: row.reason,
    occurredAt: row.occurredAt,
  }));
  return verifyChain(entries);
}

const newInviteCode = () => String(randomInt(0, 100_000_000)).padStart(8, '0');

interface NewInvite {
  phone: string;
  name: string;
  role: Role;
  organisationId: string;
  /** The inviting admin; null for the bootstrap. */
  invitedBy: string | null;
  code: string;
  reason: AdminReasonFor<'account.invited'>;
}

/**
 * Store an invite and log it, in one transaction. A newer invite replaces an
 * older one for the same number. The code is stored only as a hash.
 */
async function insertInvite(deps: Deps, invite: NewInvite): Promise<CreateInviteResponse> {
  const now = deps.now();
  const codeHash = await hashSecret(invite.code);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const id = deps.newId();
  await deps.db.transaction(async (tx) => {
    if (invite.invitedBy) await assertUnderCodeLimit(tx, invite.invitedBy, now);
    // A closed account's number may be invited again, as a new account.
    if (await openAccountByPhone(tx, invite.phone, now)) throw phoneInUse();
    await tx
      .update(accountInvites)
      .set({ replacedAt: now })
      .where(
        and(
          eq(accountInvites.kind, 'invite'),
          eq(accountInvites.phone, invite.phone),
          isNull(accountInvites.acceptedAt),
          isNull(accountInvites.replacedAt),
        ),
      );
    await tx.insert(accountInvites).values({
      id,
      phone: invite.phone,
      name: invite.name,
      role: invite.role,
      organisationId: invite.organisationId,
      codeHash,
      invitedBy: invite.invitedBy,
      createdAt: now,
      expiresAt,
    });
    await appendAdminEvent(tx, deps, {
      type: 'account.invited',
      // The bootstrap has no admin yet: its invite stands for itself.
      actorId: invite.invitedBy ?? id,
      organisationId: invite.organisationId,
      subjectKind: 'invite',
      subjectId: id,
      reason: invite.reason,
    });
  });
  return { inviteId: id, code: invite.code, expiresAt: expiresAt.toISOString() };
}

/**
 * POST /v1/admin/invites. The admin may invite only roles in GRANTABLE_ROLES,
 * into their own organisation; the platform admin, whose scope is governance,
 * may name another one. The organisation's kind must hold the role. The code
 * is returned once, for the admin to pass on; it is never sent by SMS.
 * `options.code` fixes the code, for the demo seed only.
 */
export async function createInvite(
  deps: Deps,
  admin: SessionUser,
  input: Omit<CreateInviteRequest, 'pin'>,
  options: { code?: string } = {},
): Promise<CreateInviteResponse> {
  if (!canGrant(admin.role, input.role)) {
    throw new HttpError(403, 'role_not_grantable', `${admin.role} may not invite a ${input.role}`);
  }
  const organisationId = input.organisationId ?? admin.organisationId;
  const acrossOrganisations = SCOPE_BY_ROLE[admin.role] === 'governance';
  const organisation =
    organisationId === admin.organisationId || acrossOrganisations
      ? await findOrganisation(deps.db, organisationId)
      : null;
  // Outside the admin's scope reads the same as missing.
  if (!organisation) throw notFound('Organisation');
  if (organisation.status !== 'active') {
    throw new HttpError(403, 'organisation_suspended', 'This organisation is suspended');
  }
  if (!canHold(organisation.kind, input.role)) {
    throw new HttpError(
      409,
      'role_not_in_org',
      `a ${organisation.kind} organisation cannot hold a ${input.role}`,
    );
  }
  return insertInvite(deps, {
    phone: normalisePhone(input.phone),
    name: input.name,
    role: input.role,
    organisationId: organisation.id,
    invitedBy: admin.id,
    code: options.code ?? newInviteCode(),
    reason: input.reason,
  });
}

/** Why the bootstrap would not run; the command prints it. */
export class BootstrapRefused extends Error {}

/**
 * `pnpm --filter @hunarpramaan/api admin:bootstrap`: the first platform admin.
 * Makes the operator organisation if it is missing, and an invite whose code
 * is printed once; no account or PIN exists until the person accepts it.
 * Refuses if a platform admin already exists, unless `additional` is set.
 * Never on the web (ADR 010 point 11).
 */
export async function bootstrapPlatformAdmin(
  deps: Deps,
  input: { name: string; phone: string; reason: string; additional?: boolean },
): Promise<CreateInviteResponse> {
  if (input.reason !== 'bootstrap') throw new BootstrapRefused('the reason must be "bootstrap"');
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) throw new BootstrapRefused('give a name');
  if (!Phone.safeParse(input.phone).success) {
    throw new BootstrapRefused('give a 10-digit mobile number');
  }
  const [admin] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'platform_admin'))
    .limit(1);
  if (admin && !input.additional) {
    throw new BootstrapRefused('a platform admin already exists; pass --additional to add another');
  }
  const operator = PILOT_ORGANISATIONS.operator;
  await deps.db
    .insert(organisations)
    .values({ id: operator.id, kind: 'operator', name: operator.name })
    .onConflictDoNothing();
  return insertInvite(deps, {
    phone: normalisePhone(input.phone),
    name,
    role: 'platform_admin',
    organisationId: operator.id,
    invitedBy: null,
    code: newInviteCode(),
    reason: 'bootstrap',
  });
}

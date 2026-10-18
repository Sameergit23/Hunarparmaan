/**
 * Read models for the admin panel (FR-21, FR-27, FR-29, FR-32). Each takes the
 * admin's scope as a required parameter (ADR 010 point 6), and answers with
 * masked numbers only (NFR-11). Plain reads, no transaction (ADR 008); pilot
 * data sets are small, so filtering and paging happen in code.
 */
import { and, asc, count, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import {
  AdminRole,
  maskPhone,
  type AccountAction,
  type AccountDetail,
  type AccountList,
  type AccountListItem,
  type AccountListQuery,
  type AccountStatus,
  type AdminLog,
  type AdminLogEntryView,
  type AdminLogQuery,
  type AdminLogVerification,
  type DeviceAction,
  type DeviceDetail,
  type DeviceList,
  type DeviceListItem,
  type DeviceListQuery,
  type GovernanceReport,
  type InviteList,
  type InviteListItem,
  type InviteListQuery,
  type InviteStatus,
  type LocalizedText,
  type OrgKind,
  type OrganisationView,
  type ReassessSession,
} from '@hunarpramaan/contracts';
import type { Db } from '../db/client';
import {
  accountInvites,
  adminEvents,
  authEvents,
  devices,
  evidence,
  evidenceChecks,
  organisations,
  qualifications,
  recommendations,
  sessions,
  users,
} from '../db/schema';
import { notFound } from '../http/errors';
import { accountStatus, type PhoneState } from './accounts';
import { verifyAdminLog } from './admin';
import { canActOn, canSee, type AdminScope } from './admin-scope';

export const PAGE_SIZE = 50;
/** "Not synced for 3 days or more" on the Devices screen. */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60_000;

type UserRow = typeof users.$inferSelect;
type DeviceRow = typeof devices.$inferSelect;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Offset cursors: enough for lists of a pilot's size (NFR-14). */
function pageOf<T>(items: T[], cursor: string | undefined) {
  const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString()) || 0 : 0;
  const next = offset + PAGE_SIZE;
  return {
    items: items.slice(offset, next),
    nextCursor: next < items.length ? Buffer.from(String(next)).toString('base64url') : null,
  };
}

async function organisationsById(db: Db) {
  const rows = await db.select().from(organisations);
  return new Map(rows.map((r) => [r.id, r]));
}

const orgName = (orgs: Map<string, { name: LocalizedText }>, id: string): LocalizedText =>
  orgs.get(id)?.name ?? { en: 'Unknown organisation', hi: 'अज्ञात संगठन' };

async function lastSignIns(db: Db, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, Date>();
  const rows = await db
    .select({ userId: authEvents.userId, at: max(authEvents.occurredAt) })
    .from(authEvents)
    .where(and(eq(authEvents.type, 'signed_in'), inArray(authEvents.userId, userIds)))
    .groupBy(authEvents.userId);
  return new Map(rows.flatMap((r) => (r.at ? [[r.userId, r.at] as const] : [])));
}

/** Clips each phone synced that haven't been uploaded and checked yet. */
async function clipsWaitingByDevice(db: Db, deviceIds: string[]) {
  if (deviceIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ deviceId: evidence.deviceId, n: count() })
    .from(evidence)
    .leftJoin(evidenceChecks, eq(evidenceChecks.evidenceId, evidence.id))
    .where(and(inArray(evidence.deviceId, deviceIds), isNull(evidenceChecks.id)))
    .groupBy(evidence.deviceId);
  return new Map(rows.map((r) => [r.deviceId, Number(r.n)]));
}

function namesById(rows: { id: string; name: string }[]) {
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function userNames(db: Db, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, string>();
  return namesById(
    await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, unique)),
  );
}

// --- Organisations ------------------------------------------------------------

/** All organisations for the platform admin; their own for everyone else. */
export async function listOrganisations(db: Db, scope: AdminScope): Promise<OrganisationView[]> {
  const rows = await db.select().from(organisations).orderBy(asc(organisations.createdAt));
  return rows
    .filter((r) => scope.level === 'governance' || r.id === scope.organisationId)
    .map((r) => ({ id: r.id, kind: r.kind, name: r.name, status: r.status }));
}

// --- Accounts -----------------------------------------------------------------

interface AccountFacts {
  phones: Map<string, DeviceRow[]>;
  signIns: Map<string, Date>;
  waiting: Map<string, number>;
  orgs: Map<string, { name: LocalizedText }>;
}

async function accountFacts(db: Db, accounts: UserRow[]): Promise<AccountFacts> {
  const ids = accounts.map((a) => a.id);
  const phoneRows = ids.length
    ? await db.select().from(devices).where(inArray(devices.userId, ids))
    : [];
  const phones = new Map<string, DeviceRow[]>();
  for (const row of phoneRows) phones.set(row.userId, [...(phones.get(row.userId) ?? []), row]);
  const [signIns, waiting, orgs] = await Promise.all([
    lastSignIns(db, ids),
    clipsWaitingByDevice(
      db,
      phoneRows.map((p) => p.id),
    ),
    organisationsById(db),
  ]);
  return { phones, signIns, waiting, orgs };
}

const lastSync = (phones: PhoneState[]) =>
  phones.reduce<Date | null>(
    (latest, p) => (p.lastSyncAt && (!latest || p.lastSyncAt > latest) ? p.lastSyncAt : latest),
    null,
  );

function toAccountItem(
  scope: AdminScope,
  account: UserRow,
  facts: AccountFacts,
  now: Date,
): AccountListItem {
  const phones = facts.phones.get(account.id) ?? [];
  const locked = account.lockedUntil !== null && account.lockedUntil > now;
  return {
    id: account.id,
    name: account.name,
    phone: maskPhone(account.phone),
    role: account.role,
    organisationId: account.organisationId,
    organisationName: orgName(facts.orgs, account.organisationId),
    status: accountStatus(account, phones, now),
    locked,
    lockedUntil: locked ? iso(account.lockedUntil) : null,
    lastSignInAt: iso(facts.signIns.get(account.id)),
    lastSyncAt: iso(lastSync(phones)),
    clipsWaiting: phones.reduce((n, p) => n + (facts.waiting.get(p.id) ?? 0), 0),
    actionable: canActOn(scope, account) && account.id !== scope.adminId,
  };
}

/** GET /v1/admin/accounts: people, filtered and searched, by name. */
export async function listAccounts(
  db: Db,
  scope: AdminScope,
  query: AccountListQuery,
  now: Date,
): Promise<AccountList> {
  const organisationId = scope.level === 'governance' ? query.organisationId : scope.organisationId;
  const rows = await db
    .select()
    .from(users)
    .where(organisationId ? eq(users.organisationId, organisationId) : undefined);
  const visible = rows.filter((r) => canSee(scope, r));
  const facts = await accountFacts(db, visible);
  const q = query.q?.toLowerCase();
  const items = visible
    .map((r) => ({ row: r, item: toAccountItem(scope, r, facts, now) }))
    .filter(({ row, item }) => {
      const isAdmin = AdminRole.safeParse(row.role).success;
      if (query.role === 'admin' ? !isAdmin : query.role && row.role !== query.role) return false;
      if (query.status === 'locked' ? !item.locked : query.status && item.status !== query.status)
        return false;
      if (!q) return true;
      // The last 4 digits, never more, so a search can't probe whole numbers.
      return /^\d{4}$/.test(q) ? row.phone.endsWith(q) : row.name.toLowerCase().includes(q);
    })
    .map(({ item }) => item)
    .sort((a, b) => a.name.localeCompare(b.name));
  return pageOf(items, query.cursor);
}

/** The account if it is in scope; "not found" otherwise, the same as missing. */
export async function accountInScope(db: Db, scope: AdminScope, id: string) {
  const [account] = await db.select().from(users).where(eq(users.id, id));
  if (!account || !canSee(scope, account)) throw notFound('Account');
  return account;
}

export function accountActions(
  scope: AdminScope,
  account: UserRow,
  status: AccountStatus,
  locked: boolean,
): AccountAction[] {
  if (account.id === scope.adminId || !canActOn(scope, account)) return [];
  if (status === 'active')
    return [...(locked ? ['unlock' as const] : []), 'reset_pin', 'deactivate'];
  // Only whoever deactivated it, or the platform admin, may bring it back (FR-24).
  const issuer = account.statusChangedBy === scope.adminId || scope.level === 'governance';
  return status === 'draining' && issuer ? ['reactivate'] : [];
}

/** GET /v1/admin/accounts/:id */
export async function accountDetail(
  db: Db,
  scope: AdminScope,
  id: string,
  now: Date,
): Promise<AccountDetail> {
  const account = await accountInScope(db, scope, id);
  const facts = await accountFacts(db, [account]);
  const item = toAccountItem(scope, account, facts, now);
  const phones = facts.phones.get(account.id) ?? [];
  const [invite] = await db
    .select({ id: accountInvites.id, invitedBy: accountInvites.invitedBy })
    .from(accountInvites)
    .where(and(eq(accountInvites.kind, 'invite'), eq(accountInvites.acceptedUserId, account.id)));
  const names = await userNames(
    db,
    [invite?.invitedBy, account.statusChangedBy].filter((x): x is string => Boolean(x)),
  );
  const subjects = [account.id, ...phones.map((p) => p.id), ...(invite ? [invite.id] : [])];
  const recent = await db
    .select()
    .from(adminEvents)
    .where(inArray(adminEvents.subjectId, subjects))
    .orderBy(desc(adminEvents.seq))
    .limit(20);
  return {
    ...item,
    createdAt: account.createdAt.toISOString(),
    invitedBy: invite?.invitedBy ? (names.get(invite.invitedBy) ?? null) : null,
    failedPinAttempts: account.failedPinAttempts,
    statusChangedAt: iso(account.statusChangedAt),
    statusChangedBy: account.statusChangedBy ? (names.get(account.statusChangedBy) ?? null) : null,
    self: account.id === scope.adminId,
    devices: phones.map((p) => toDeviceItem(p, account, facts.waiting)),
    recentActions: await logViews(db, recent),
    allowedActions: accountActions(scope, account, item.status, item.locked),
  };
}

// --- Invites ------------------------------------------------------------------

function inviteStatus(row: typeof accountInvites.$inferSelect, now: Date): InviteStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.replacedAt) return 'replaced';
  return row.expiresAt <= now ? 'expired' : 'pending';
}

/** GET /v1/admin/invites: newest first. PIN resets aren't invites. */
export async function listInvites(
  db: Db,
  scope: AdminScope,
  query: InviteListQuery,
  now: Date,
): Promise<InviteList> {
  const rows = await db
    .select()
    .from(accountInvites)
    .where(eq(accountInvites.kind, 'invite'))
    .orderBy(desc(accountInvites.createdAt));
  const visible = rows.filter((r) => canSee(scope, r));
  const [orgs, names] = await Promise.all([
    organisationsById(db),
    userNames(
      db,
      visible.flatMap((r) => (r.invitedBy ? [r.invitedBy] : [])),
    ),
  ]);
  const items: InviteListItem[] = visible
    .map((r) => ({
      id: r.id,
      name: r.name,
      phone: maskPhone(r.phone),
      role: r.role,
      organisationId: r.organisationId,
      organisationName: orgName(orgs, r.organisationId),
      invitedBy: r.invitedBy ? (names.get(r.invitedBy) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      status: inviteStatus(r, now),
    }))
    .filter((i) => !query.status || i.status === query.status);
  return pageOf(items, query.cursor);
}

// --- Devices ------------------------------------------------------------------

function toDeviceItem(
  device: DeviceRow,
  owner: UserRow,
  waiting: Map<string, number>,
): DeviceListItem {
  return {
    id: device.id,
    label: device.label,
    ownerId: owner.id,
    ownerName: owner.name,
    ownerRole: owner.role,
    organisationId: owner.organisationId,
    status: device.status,
    registeredAt: device.registeredAt.toISOString(),
    lastSyncAt: iso(device.lastSyncAt),
    clipsWaiting: waiting.get(device.id) ?? 0,
  };
}

/** GET /v1/admin/devices: phones, by owner. */
export async function listDevices(
  db: Db,
  scope: AdminScope,
  query: DeviceListQuery,
  now: Date,
): Promise<DeviceList> {
  const organisationId = scope.level === 'governance' ? query.organisationId : scope.organisationId;
  const rows = await db
    .select({ device: devices, owner: users })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.userId))
    .where(organisationId ? eq(users.organisationId, organisationId) : undefined);
  const visible = rows.filter((r) => canSee(scope, r.owner));
  const waiting = await clipsWaitingByDevice(
    db,
    visible.map((r) => r.device.id),
  );
  const staleBefore = now.getTime() - STALE_AFTER_MS;
  const items = visible
    .filter(({ device }) => !query.status || device.status === query.status)
    .filter(
      ({ device }) =>
        !query.stale || (device.lastSyncAt ?? device.registeredAt).getTime() <= staleBefore,
    )
    .map(({ device, owner }) => toDeviceItem(device, owner, waiting))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.id.localeCompare(b.id));
  return pageOf(items, query.cursor);
}

export async function deviceInScope(db: Db, scope: AdminScope, id: string) {
  const [row] = await db
    .select({ device: devices, owner: users })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.userId))
    .where(eq(devices.id, id));
  if (!row || !canSee(scope, row.owner)) throw notFound('Phone');
  return row;
}

export function deviceActions(scope: AdminScope, device: DeviceRow): DeviceAction[] {
  if (device.userId === scope.adminId) return [];
  if (device.status === 'registered') return ['mark_lost', 'retire'];
  return device.status === 'lost' ? [] : ['mark_lost'];
}

/**
 * Sessions started on a lost phone that need a new assessment (FR-28): no
 * signed result, or clips that never arrived. No worker names: the agency
 * user opens them from the Sessions page.
 */
async function sessionsToReassess(db: Db, deviceId: string): Promise<ReassessSession[]> {
  const rows = await db
    .select({ session: sessions, title: qualifications.title })
    .from(sessions)
    .innerJoin(qualifications, eq(qualifications.nqrCode, sessions.nqrCode))
    .where(eq(sessions.deviceId, deviceId))
    .orderBy(asc(sessions.startedAt));
  const out: ReassessSession[] = [];
  for (const { session, title } of rows) {
    const [signed] = await db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sessionId, session.id))
      .limit(1);
    const [waiting] = await db
      .select({ n: count() })
      .from(evidence)
      .leftJoin(evidenceChecks, eq(evidenceChecks.evidenceId, evidence.id))
      .where(and(eq(evidence.sessionId, session.id), isNull(evidenceChecks.id)));
    const reason = !signed ? 'unsigned' : Number(waiting?.n ?? 0) > 0 ? 'clips_waiting' : null;
    if (reason) {
      out.push({
        sessionId: session.id,
        nqrCode: session.nqrCode,
        qualificationTitle: title,
        startedAt: session.startedAt.toISOString(),
        reason,
      });
    }
  }
  return out;
}

/** GET /v1/admin/devices/:id */
export async function deviceDetail(db: Db, scope: AdminScope, id: string): Promise<DeviceDetail> {
  const { device, owner } = await deviceInScope(db, scope, id);
  const waiting = await clipsWaitingByDevice(db, [device.id]);
  const names = await userNames(db, device.statusChangedBy ? [device.statusChangedBy] : []);
  return {
    ...toDeviceItem(device, owner, waiting),
    statusChangedAt: iso(device.statusChangedAt),
    statusChangedBy: device.statusChangedBy ? (names.get(device.statusChangedBy) ?? null) : null,
    sessionsToReassess: device.status === 'lost' ? await sessionsToReassess(db, device.id) : [],
    allowedActions: deviceActions(scope, device),
  };
}

// --- The admin log ------------------------------------------------------------

type AdminEventRow = typeof adminEvents.$inferSelect;

/** Ids worked out to names for reading; the log itself holds ids only (ADR 011). */
async function logViews(db: Db, rows: AdminEventRow[]): Promise<AdminLogEntryView[]> {
  const of = (kind: string) => rows.filter((r) => r.subjectKind === kind).map((r) => r.subjectId);
  const inviteIds = of('invite');
  const deviceIds = of('device');
  const [orgs, people, invites, phones] = await Promise.all([
    organisationsById(db),
    userNames(db, [...rows.map((r) => r.actorId), ...of('account')]),
    inviteIds.length
      ? db
          .select({ id: accountInvites.id, name: accountInvites.name })
          .from(accountInvites)
          .where(inArray(accountInvites.id, inviteIds))
      : [],
    deviceIds.length
      ? db
          .select({ id: devices.id, label: devices.label })
          .from(devices)
          .where(inArray(devices.id, deviceIds))
      : [],
  ]);
  const inviteNames = namesById(invites);
  const phoneNames = new Map(phones.map((p) => [p.id, p.label ?? p.id]));
  const subjectName = (row: AdminEventRow) => {
    switch (row.subjectKind) {
      case 'account':
        return people.get(row.subjectId) ?? null;
      case 'invite':
        return inviteNames.get(row.subjectId) ?? null;
      case 'device':
        return phoneNames.get(row.subjectId) ?? null;
      case 'organisation':
        return orgs.get(row.subjectId)?.name.en ?? null;
    }
  };
  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    type: row.type,
    occurredAt: row.occurredAt,
    actorName: people.get(row.actorId) ?? null,
    organisationId: row.organisationId,
    organisationName: orgName(orgs, row.organisationId),
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    subjectName: subjectName(row),
    reason: row.reason,
  }));
}

/** The start of a day in India, where the pilot runs. */
const istDay = (day: string) => Date.parse(`${day}T00:00:00+05:30`);
const DAY_MS = 24 * 60 * 60_000;

/** GET /v1/admin/log: newest first; own organisation, or every one for the platform admin. */
export async function adminLog(db: Db, scope: AdminScope, query: AdminLogQuery): Promise<AdminLog> {
  const rows = await db
    .select()
    .from(adminEvents)
    .where(
      and(
        scope.level === 'governance'
          ? undefined
          : eq(adminEvents.organisationId, scope.organisationId),
        query.type ? eq(adminEvents.type, query.type) : undefined,
      ),
    )
    .orderBy(desc(adminEvents.seq));
  const from = query.from ? istDay(query.from) : -Infinity;
  const to = query.to ? istDay(query.to) + DAY_MS : Infinity;
  const inRange = rows.filter((r) => {
    const at = Date.parse(r.occurredAt);
    return at >= from && at < to;
  });
  const page = pageOf(inRange, query.cursor);
  return { items: await logViews(db, page.items), nextCursor: page.nextCursor };
}

/** "Verify chain": the whole log re-checked from the first entry (FR-29). */
export async function verifyLog(db: Db, now: Date): Promise<AdminLogVerification> {
  const result = await verifyAdminLog(db);
  if (result.ok) {
    return { ok: true, entries: result.count, failedAtSeq: null, checkedAt: now.toISOString() };
  }
  const [total] = await db.select({ n: count() }).from(adminEvents);
  return {
    ok: false,
    entries: Number(total?.n ?? 0),
    failedAtSeq: result.seq,
    checkedAt: now.toISOString(),
  };
}

/** Monday 00:00 UTC of the week `iso` falls in. */
function weekStart(iso: string): string {
  const d = new Date(iso);
  const monday =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    ((d.getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(monday).toISOString();
}

/**
 * GET /v1/governance (FR-32): counts by week, organisation kind and action,
 * newest week first. No name, number or id leaves this function.
 */
export async function governanceReport(db: Db): Promise<GovernanceReport> {
  const rows = await db
    .select({
      type: adminEvents.type,
      occurredAt: adminEvents.occurredAt,
      kind: organisations.kind,
    })
    .from(adminEvents)
    .innerJoin(organisations, eq(organisations.id, adminEvents.organisationId));
  const weeks = new Map<
    string,
    Map<string, { orgKind: OrgKind; type: AdminEventRow['type']; count: number }>
  >();
  for (const row of rows) {
    const week = weekStart(row.occurredAt);
    const cells = weeks.get(week) ?? new Map();
    const key = `${row.kind} ${row.type}`;
    const cell = cells.get(key) ?? { orgKind: row.kind, type: row.type, count: 0 };
    cell.count += 1;
    cells.set(key, cell);
    weeks.set(week, cells);
  }
  return {
    weeks: [...weeks.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([week, cells]) => ({
        weekStart: week,
        rows: [...cells.values()].sort(
          (a, b) => a.orgKind.localeCompare(b.orgKind) || a.type.localeCompare(b.type),
        ),
      })),
  };
}

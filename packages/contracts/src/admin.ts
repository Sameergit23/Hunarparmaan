/**
 * The admin panel (ADR 010, docs/design/admin-panel): what the admin log
 * records, and the shapes admins send and read. Admins manage people,
 * organisations and phones, and never decide.
 */
import { z } from 'zod';
import { InviteCode, Phone, Pin, Ticket } from './api';
import { ADMIN_ACTION_TYPES, type AdminActionType } from './authority';
import { EntityId, LocalizedText, Timestamp } from './common';
import { OrgKind, Role } from './roles';

/** An organisation that is suspended can't sign in (phase 2 sets it). */
export const OrganisationStatus = z.enum(['active', 'suspended']);
export type OrganisationStatus = z.infer<typeof OrganisationStatus>;

/**
 * An account's status (ADR 010 point 8). `draining`: deactivated; work
 * recorded offline before then still syncs and is flagged, but nothing new
 * may start. It becomes `closed` 30 days after the last sync from its phones,
 * or at once with no phones. "Invited" is an invite, and "locked" comes from
 * wrong PINs; neither is a status.
 */
export const AccountStatus = z.enum(['active', 'draining', 'closed']);
export type AccountStatus = z.infer<typeof AccountStatus>;

/**
 * A phone's status. A `retired` or `replaced` phone drains like a deactivated
 * account; a `lost` one is refused on every sync after the report.
 */
export const DeviceStatus = z.enum(['registered', 'retired', 'replaced', 'lost']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

/** What an admin-log entry is about, so the Audit log can link each row. */
export const AdminSubjectKind = z.enum(['account', 'invite', 'device', 'organisation']);
export type AdminSubjectKind = z.infer<typeof AdminSubjectKind>;

export const AdminActionTypeSchema = z.enum(ADMIN_ACTION_TYPES);

/**
 * Why an admin acted, one list per action (TRD section 5.3). Codes, never free
 * text, so the admin log holds no personal data (ADR 011). Phase 2 actions
 * get their lists when they are built.
 */
export const ADMIN_REASON_CODES = {
  'organisation.created': ['new_partner'],
  'organisation.suspended': ['recognition_suspended', 'contract_ended', 'under_investigation'],
  // `bootstrap` only from the command line, for the first platform admin.
  'account.invited': ['new_staff', 'replacement', 'additional_admin', 'bootstrap'],
  'account.deactivated': [
    'left_organisation',
    'role_ended',
    'duplicate_account',
    'suspected_misuse',
    'on_request',
  ],
  'account.reactivated': ['returned', 'deactivated_in_error'],
  'account.unlocked': ['identity_checked_by_phone', 'identity_checked_in_person'],
  'account.pin_reset': ['forgot_pin', 'suspected_compromise'],
  'device.revoked': ['lost', 'stolen', 'replaced', 'retired', 'suspected_compromise'],
} as const satisfies Partial<Record<AdminActionType, readonly string[]>>;

type ReasonLists = typeof ADMIN_REASON_CODES;
/** Admin actions that have reason codes. */
export type ReasonedAdminAction = keyof ReasonLists;
export type AdminReasonFor<A extends ReasonedAdminAction> = ReasonLists[A][number];
export type AdminReasonCode = AdminReasonFor<ReasonedAdminAction>;

const allReasons = [...new Set(Object.values(ADMIN_REASON_CODES).flat())];
export const AdminReasonCode = z.enum(allReasons as [AdminReasonCode, ...AdminReasonCode[]]);

/** Whether `reason` is one of the codes for `action`. */
export function reasonFits(action: AdminActionType, reason: string): boolean {
  const lists: Partial<Record<AdminActionType, readonly string[]>> = ADMIN_REASON_CODES;
  return lists[action]?.includes(reason) ?? false;
}

// --- Writes -------------------------------------------------------------------

/**
 * Every admin write carries a reason code and the admin's own PIN again
 * (FR-30, TRD D-2). A wrong PIN counts towards the admin's own lockout.
 */
const write = <A extends ReasonedAdminAction>(action: A) =>
  z.strictObject({ reason: z.enum(ADMIN_REASON_CODES[action]), pin: Pin });

/** The invite reasons an admin may give; `bootstrap` is only for the command line. */
export const InviteReason = z.enum(['new_staff', 'replacement', 'additional_admin']);
export type InviteReason = z.infer<typeof InviteReason>;

/**
 * POST /v1/admin/invites: which roles an admin may invite is GRANTABLE_ROLES,
 * and the organisation's kind must hold the role (ROLES_BY_ORG_KIND).
 */
export const CreateInviteRequest = z.strictObject({
  phone: Phone,
  name: z.string().trim().min(1).max(120),
  role: Role,
  /**
   * Only the platform admin invites into another organisation (each one's first
   * admin, and NCVET's accounts). Organisation admins invite into their own.
   */
  organisationId: EntityId.optional(),
  reason: InviteReason,
  pin: Pin,
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

export const DeactivateRequest = write('account.deactivated');
export type DeactivateRequest = z.infer<typeof DeactivateRequest>;
export const ReactivateRequest = write('account.reactivated');
export type ReactivateRequest = z.infer<typeof ReactivateRequest>;
export const UnlockRequest = write('account.unlocked');
export type UnlockRequest = z.infer<typeof UnlockRequest>;
export const PinResetRequest = write('account.pin_reset');
export type PinResetRequest = z.infer<typeof PinResetRequest>;

/**
 * The status each phone reason leads to, so the admin log's reason alone says
 * what happened to the phone: lost, stolen or compromised phones are refused;
 * retired and replaced ones drain.
 */
export const DEVICE_STATUS_FOR_REASON = {
  lost: 'lost',
  stolen: 'lost',
  suspected_compromise: 'lost',
  replaced: 'replaced',
  retired: 'retired',
} as const satisfies Record<AdminReasonFor<'device.revoked'>, Exclude<DeviceStatus, 'registered'>>;

/** POST /v1/admin/devices/:id/revoke. The status must be the one the reason leads to. */
export const RevokeDeviceRequest = write('device.revoked')
  .extend({ status: DeviceStatus.exclude(['registered']) })
  .refine((r) => DEVICE_STATUS_FOR_REASON[r.reason] === r.status, {
    message: 'this reason does not fit the status',
    path: ['reason'],
  });
export type RevokeDeviceRequest = z.infer<typeof RevokeDeviceRequest>;

/** POST /v1/admin/accounts/:id/pin-reset: shown to the admin once, valid 24 hours. */
export const PinResetResponse = z.strictObject({ code: InviteCode, expiresAt: Timestamp });
export type PinResetResponse = z.infer<typeof PinResetResponse>;

/** POST /v1/auth/pin-reset/accept: after `otp/verify`, the reset code and a new PIN. */
export const AcceptPinResetRequest = z.strictObject({
  ticket: Ticket,
  code: InviteCode,
  newPin: Pin,
});
export type AcceptPinResetRequest = z.infer<typeof AcceptPinResetRequest>;

// --- Reads --------------------------------------------------------------------

/** Every number an admin sees: `XXXXXX` and the last 4 digits (NFR-11, TRD D-5). */
export const MaskedPhone = z.string().regex(/^X{6}\d{4}$/, 'expected a masked number');
export type MaskedPhone = z.infer<typeof MaskedPhone>;

export function maskPhone(phone: string): MaskedPhone {
  const digits = phone.replace(/\D/g, '');
  return `XXXXXX${digits.slice(-4).padStart(4, '0')}`;
}

export const OrganisationView = z.strictObject({
  id: EntityId,
  kind: OrgKind,
  name: LocalizedText,
  status: OrganisationStatus,
});
export type OrganisationView = z.infer<typeof OrganisationView>;

export const AccountAction = z.enum(['deactivate', 'reactivate', 'unlock', 'reset_pin']);
export type AccountAction = z.infer<typeof AccountAction>;
export const DeviceAction = z.enum(['mark_lost', 'retire']);
export type DeviceAction = z.infer<typeof DeviceAction>;

/** Pages of 50, with the cursor for the next page or null on the last one. */
const page = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });

export const AccountListItem = z.strictObject({
  id: EntityId,
  name: z.string(),
  phone: MaskedPhone,
  role: Role,
  organisationId: EntityId,
  organisationName: LocalizedText,
  status: AccountStatus,
  /** Locked after wrong PINs, until `lockedUntil`. */
  locked: z.boolean(),
  lockedUntil: Timestamp.nullable(),
  lastSignInAt: Timestamp.nullable(),
  lastSyncAt: Timestamp.nullable(),
  /** Clips the account's phones synced but haven't uploaded and had checked yet. */
  clipsWaiting: z.int(),
  /** Whether this admin may act on it: the platform admin acts only on admins and NCVET. */
  actionable: z.boolean(),
});
export type AccountListItem = z.infer<typeof AccountListItem>;
export const AccountList = page(AccountListItem);
export type AccountList = z.infer<typeof AccountList>;

export const DeviceListItem = z.strictObject({
  id: z.string(),
  label: z.string().nullable(),
  ownerId: EntityId,
  ownerName: z.string(),
  ownerRole: Role,
  organisationId: EntityId,
  status: DeviceStatus,
  registeredAt: Timestamp,
  lastSyncAt: Timestamp.nullable(),
  clipsWaiting: z.int(),
});
export type DeviceListItem = z.infer<typeof DeviceListItem>;
export const DeviceList = page(DeviceListItem);
export type DeviceList = z.infer<typeof DeviceList>;

/** One admin action, with ids worked out to names when read; the log itself holds only ids. */
export const AdminLogEntryView = z.strictObject({
  id: EntityId,
  seq: z.int(),
  type: AdminActionTypeSchema,
  occurredAt: Timestamp,
  /** Null for the bootstrap, which had no admin yet. */
  actorName: z.string().nullable(),
  organisationId: EntityId,
  organisationName: LocalizedText,
  subjectKind: AdminSubjectKind,
  subjectId: z.string(),
  subjectName: z.string().nullable(),
  reason: AdminReasonCode,
});
export type AdminLogEntryView = z.infer<typeof AdminLogEntryView>;
export const AdminLog = page(AdminLogEntryView);
export type AdminLog = z.infer<typeof AdminLog>;

export const AccountDetail = AccountListItem.extend({
  createdAt: Timestamp,
  invitedBy: z.string().nullable(),
  failedPinAttempts: z.int(),
  /** The last deactivation or reactivation, and who did it. */
  statusChangedAt: Timestamp.nullable(),
  statusChangedBy: z.string().nullable(),
  /** The admin's own account: nothing is offered. */
  self: z.boolean(),
  devices: z.array(DeviceListItem),
  /** The last 20 admin-log entries about the account, its invite and its phones. */
  recentActions: z.array(AdminLogEntryView),
  allowedActions: z.array(AccountAction),
});
export type AccountDetail = z.infer<typeof AccountDetail>;

export const InviteStatus = z.enum(['pending', 'accepted', 'expired', 'replaced']);
export type InviteStatus = z.infer<typeof InviteStatus>;

export const InviteListItem = z.strictObject({
  id: EntityId,
  name: z.string(),
  phone: MaskedPhone,
  role: Role,
  organisationId: EntityId,
  organisationName: LocalizedText,
  /** Null for the bootstrap. */
  invitedBy: z.string().nullable(),
  createdAt: Timestamp,
  expiresAt: Timestamp,
  status: InviteStatus,
});
export type InviteListItem = z.infer<typeof InviteListItem>;
export const InviteList = page(InviteListItem);
export type InviteList = z.infer<typeof InviteList>;

/** A session on a lost phone that needs a new assessment, without the worker's name. */
export const ReassessSession = z.strictObject({
  sessionId: EntityId,
  nqrCode: z.string(),
  qualificationTitle: LocalizedText,
  startedAt: Timestamp,
  /** No signed result yet, or clips that never arrived. */
  reason: z.enum(['unsigned', 'clips_waiting']),
});
export type ReassessSession = z.infer<typeof ReassessSession>;

export const DeviceDetail = DeviceListItem.extend({
  statusChangedAt: Timestamp.nullable(),
  statusChangedBy: z.string().nullable(),
  /** Only for a lost phone (FR-28). */
  sessionsToReassess: z.array(ReassessSession),
  allowedActions: z.array(DeviceAction),
});
export type DeviceDetail = z.infer<typeof DeviceDetail>;

/** "Verify chain": the admin log re-checked from the first entry. */
export const AdminLogVerification = z.strictObject({
  ok: z.boolean(),
  entries: z.int(),
  /** The entry where the chain breaks, when it does. */
  failedAtSeq: z.int().nullable(),
  checkedAt: Timestamp,
});
export type AdminLogVerification = z.infer<typeof AdminLogVerification>;

/** NCVET's view (FR-32): counts by week, organisation kind and action. No name, number or id. */
export const GovernanceReport = z.strictObject({
  weeks: z.array(
    z.strictObject({
      /** Monday 00:00 UTC. */
      weekStart: Timestamp,
      rows: z.array(
        z.strictObject({ orgKind: OrgKind, type: AdminActionTypeSchema, count: z.int() }),
      ),
    }),
  ),
});
export type GovernanceReport = z.infer<typeof GovernanceReport>;

// --- Queries ------------------------------------------------------------------

const cursor = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/)
  .optional();

/** GET /v1/admin/accounts. `role=admin` is any admin role; `q` is a name or the last 4 digits. */
export const AccountListQuery = z.strictObject({
  role: z.union([Role, z.literal('admin')]).optional(),
  status: z.union([AccountStatus, z.literal('locked')]).optional(),
  q: z.string().trim().min(1).max(60).optional(),
  organisationId: EntityId.optional(),
  cursor,
});
export type AccountListQuery = z.infer<typeof AccountListQuery>;

export const InviteListQuery = z.strictObject({ status: InviteStatus.optional(), cursor });
export type InviteListQuery = z.infer<typeof InviteListQuery>;

/** GET /v1/admin/devices. `stale=true`: not synced for 3 days or more. */
export const DeviceListQuery = z.strictObject({
  status: DeviceStatus.optional(),
  stale: z.literal('true').optional(),
  organisationId: EntityId.optional(),
  cursor,
});
export type DeviceListQuery = z.infer<typeof DeviceListQuery>;

/** GET /v1/admin/log. `from` and `to` are days, `to` included. */
export const AdminLogQuery = z.strictObject({
  type: AdminActionTypeSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor,
});
export type AdminLogQuery = z.infer<typeof AdminLogQuery>;

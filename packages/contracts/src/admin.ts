/**
 * The admin panel's API (ADR 010, docs/design/access-control.md). Admins manage
 * people, organisations and phones. They never score, sign, approve, review a
 * flag or edit a record, and every admin action is recorded in the
 * hash-chained admin log.
 *
 * Rule 8: no PIN, one-time code or full phone number is ever returned in a
 * list or stored in the admin log. An invite code is shown once, to the admin
 * who created it.
 */
import { z } from 'zod';
import { ADMIN_ACTION_TYPES } from './authority';
import { EntityId, Sha256Hex, Timestamp } from './common';
import { OrgKind, Role } from './roles';

const Pin = z.string().regex(/^\d{4,6}$/, 'expected a 4 to 6 digit PIN');
const Phone = z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'expected a 10-digit mobile number');
const Name = z.string().trim().min(2).max(80);

/**
 * Every admin action asks for the admin's own PIN again (step-up), so a
 * browser left signed in cannot be used to lock people out.
 */
const StepUp = { pin: Pin };

/** The admin action types as a schema; the type itself is `AdminActionType` (authority.ts). */
export const AdminAction = z.enum(ADMIN_ACTION_TYPES);

// --- Organisations ----------------------------------------------------------

export const OrgStatus = z.enum(['active', 'suspended']);
export type OrgStatus = z.infer<typeof OrgStatus>;

export const OrganisationView = z.strictObject({
  id: EntityId,
  name: z.string(),
  kind: OrgKind,
  status: OrgStatus,
  /** Active admin accounts; the panel warns when there is only one. */
  admins: z.int(),
  accounts: z.int(),
  createdAt: Timestamp,
});
export type OrganisationView = z.infer<typeof OrganisationView>;

/** A one-time code for a new account, shown once to the admin who created it. */
export const InviteIssued = z.strictObject({
  accountId: EntityId,
  /** 8 characters, for example `K7M2-Q9XR`. Never stored in clear and never shown again. */
  code: z.string().regex(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
  expiresAt: Timestamp,
});
export type InviteIssued = z.infer<typeof InviteIssued>;

/** POST /v1/admin/organisations (platform admin): an organisation and its first admin. */
export const CreateOrganisationRequest = z.strictObject({
  name: z.string().trim().min(3).max(120),
  kind: OrgKind.exclude(['operator']),
  firstAdmin: z.strictObject({ name: Name, phone: Phone }),
  ...StepUp,
});
export type CreateOrganisationRequest = z.infer<typeof CreateOrganisationRequest>;

export const CreateOrganisationResponse = z.strictObject({
  organisation: OrganisationView,
  /** Null for the regulator, which has no admin role: invite its NCVET accounts instead. */
  invite: InviteIssued.nullable(),
});
export type CreateOrganisationResponse = z.infer<typeof CreateOrganisationResponse>;

export const OrgSuspendReason = z.enum([
  'contract_ended',
  'under_investigation',
  'requested_by_organisation',
  'other',
]);
export type OrgSuspendReason = z.infer<typeof OrgSuspendReason>;

export const SuspendOrganisationRequest = z.strictObject({ reason: OrgSuspendReason, ...StepUp });
export type SuspendOrganisationRequest = z.infer<typeof SuspendOrganisationRequest>;

export const StepUpRequest = z.strictObject(StepUp);
export type StepUpRequest = z.infer<typeof StepUpRequest>;

// --- People -----------------------------------------------------------------

/**
 * - `invited`: created by an admin, waiting for the person to set a PIN.
 * - `active`: can sign in.
 * - `draining`: deactivated. Work already recorded offline on their phone can
 *   still sync, and is flagged for review; they cannot sign in or start anything new.
 */
export const AccountStatus = z.enum(['invited', 'active', 'draining']);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const DeactivationReason = z.enum([
  'left_organisation',
  'role_changed',
  'suspected_misuse',
  'long_inactive',
  'other',
]);
export type DeactivationReason = z.infer<typeof DeactivationReason>;

export const AccountView = z.strictObject({
  id: EntityId,
  name: z.string(),
  role: Role,
  orgId: EntityId,
  orgName: z.string(),
  /** For example `90xxxxxx06`: enough to tell people apart, never the full number. */
  phoneMasked: z.string(),
  status: AccountStatus,
  /** Set while too many wrong PINs keep the account locked (at most one hour). */
  lockedUntil: Timestamp.nullable(),
  lastSyncAt: Timestamp.nullable(),
  devices: z.int(),
  createdAt: Timestamp,
  deactivation: z
    .strictObject({ reason: DeactivationReason, byName: z.string(), at: Timestamp })
    .nullable(),
});
export type AccountView = z.infer<typeof AccountView>;

/** POST /v1/admin/invites. The org is the admin's own, except for the platform admin. */
export const InviteRequest = z.strictObject({
  orgId: EntityId,
  role: Role,
  name: Name,
  phone: Phone,
  ...StepUp,
});
export type InviteRequest = z.infer<typeof InviteRequest>;

export const DeactivateRequest = z.strictObject({ reason: DeactivationReason, ...StepUp });
export type DeactivateRequest = z.infer<typeof DeactivateRequest>;

/** POST /v1/auth/activate (no sign-in): the invited person sets their PIN. */
export const ActivateRequest = z
  .strictObject({
    phone: Phone,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-Z]{4}-?[0-9A-Z]{4}$/, 'expected the 8-character code'),
    pin: Pin,
    pinAgain: Pin,
  })
  .refine((r) => r.pin === r.pinAgain, { message: 'the two PINs differ', path: ['pinAgain'] });
export type ActivateRequest = z.infer<typeof ActivateRequest>;

// --- Devices ----------------------------------------------------------------

/**
 * - `retired` and `replaced` phones drain: what they recorded still syncs and is flagged.
 * - A `lost` phone is refused from `lostSince`; the sessions it touched are listed for re-assessment.
 */
export const DeviceStatus = z.enum(['active', 'retired', 'replaced', 'lost']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

export const DeviceView = z.strictObject({
  id: z.string(),
  label: z.string().nullable(),
  ownerId: EntityId,
  ownerName: z.string(),
  ownerRole: Role,
  orgName: z.string(),
  status: DeviceStatus,
  registeredAt: Timestamp,
  lastSyncAt: Timestamp.nullable(),
  revokedAt: Timestamp.nullable(),
  /** Sessions with events from this phone after it was lost: to re-assess. */
  affectedSessions: z.int(),
});
export type DeviceView = z.infer<typeof DeviceView>;

export const RevokeDeviceRequest = z.strictObject({
  reason: DeviceStatus.exclude(['active']),
  /** For a lost phone: events it recorded after this time are refused. Defaults to now. */
  lostSince: Timestamp.optional(),
  ...StepUp,
});
export type RevokeDeviceRequest = z.infer<typeof RevokeDeviceRequest>;

// --- Admin log --------------------------------------------------------------

export const AdminSubject = z.strictObject({
  kind: z.enum(['organisation', 'account', 'device']),
  id: z.string(),
  /** Resolved when read; the log itself stores ids only (rule 8). */
  label: z.string(),
});
export type AdminSubject = z.infer<typeof AdminSubject>;

export const AdminEventView = z.strictObject({
  seq: z.int().positive(),
  id: EntityId,
  type: AdminAction,
  actorName: z.string(),
  actorRole: Role,
  orgName: z.string().nullable(),
  subject: AdminSubject,
  /** A reason code, such as `left_organisation` or `lost`, or the role given. */
  reason: z.string().nullable(),
  at: Timestamp,
  prevHash: Sha256Hex,
  hash: Sha256Hex,
});
export type AdminEventView = z.infer<typeof AdminEventView>;

export const AdminLogVerify = z.strictObject({
  ok: z.boolean(),
  entries: z.int(),
  failedAtSeq: z.int().nullable(),
  reason: z.string().nullable(),
});
export type AdminLogVerify = z.infer<typeof AdminLogVerify>;

/** Error codes the admin API returns, worded by the web app in Hindi and English. */
export const AdminErrorCode = z.enum([
  'wrong_pin',
  'not_grantable',
  'phone_taken',
  'own_account',
  'last_admin',
  'not_your_org',
  'org_suspended',
  'not_deactivated_by_you',
  'already_revoked',
  'invite_invalid',
]);
export type AdminErrorCode = z.infer<typeof AdminErrorCode>;

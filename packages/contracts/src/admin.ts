/**
 * The admin panel (ADR 010, docs/design/admin-panel): what the admin log
 * records, and the shapes admins send and read. Admins manage people,
 * organisations and phones, and never decide.
 */
import { z } from 'zod';
import type { AdminActionType } from './authority';

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

/**
 * Who may do what. Rule 1 in CLAUDE.md: AI suggests, people decide.
 *
 * Each action lists the principals allowed to perform it. `system` stands for
 * automated components (the on-device mapper and the server's queue worker).
 * The API enforces this table by role on every write, and the sync event
 * schema enforces it too, so a phone cannot even build a forbidden event.
 */
import type { Actor, AdminRole, OrgKind, Role } from './roles';

export type Principal = Role | 'system';

/** Events created on the phone and synced through the per-device hash chain. */
export const DEVICE_EVENT_TYPES = [
  'consent.given',
  'consent.withdrawn',
  'worker.registered',
  'declaration.recorded',
  'mapping.suggested',
  'route.decided',
  'session.started',
  'calibration.scored',
  'evidence.captured',
  'score.recorded',
  'recommendation.signed',
] as const;
export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

/** Writes that happen only through the API, never offline. */
export const SERVER_ACTION_TYPES = [
  'device.registered',
  'ai_result.stored',
  'flag.reviewed',
  'rescore.recorded',
  'recommendation.approved',
  'sidh.exported',
] as const;
export type ServerActionType = (typeof SERVER_ACTION_TYPES)[number];

/**
 * Admin actions (ADR 010): people, organisations and phones, never a decision.
 * Recorded in the append-only, hash-chained admin log with reason codes. Only
 * admin roles hold them, and admin roles hold nothing else.
 */
export const ADMIN_ACTION_TYPES = [
  'organisation.created',
  'organisation.suspended',
  'account.invited',
  'account.deactivated',
  'account.reactivated',
  'account.unlocked',
  'account.pin_reset',
  'device.revoked',
  'trade_pack.uploaded',
  'trade_pack.released',
  'accreditation.granted',
  'venue.saved',
] as const;
export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number];

export type Action = DeviceEventType | ServerActionType | AdminActionType;

const ASSESSORS = ['assessor', 'master_assessor'] as const;
const ADMINS = ['platform_admin', 'tp_admin', 'agency_admin', 'ab_admin'] as const;

export const AUTHORITY = {
  'consent.given': ['worker', 'mobiliser'],
  'consent.withdrawn': ['worker', 'mobiliser'],
  'worker.registered': ['mobiliser'],
  'declaration.recorded': ['worker', 'mobiliser'],
  // A suggestion only: the provisional keyword match made on the phone.
  'mapping.suggested': ['system'],
  'route.decided': ['mobiliser'],
  'session.started': ASSESSORS,
  'calibration.scored': ASSESSORS,
  'evidence.captured': ASSESSORS,
  'score.recorded': ASSESSORS,
  'recommendation.signed': ASSESSORS,
  'device.registered': ['mobiliser', ...ASSESSORS],
  // The queue worker stores AI results (mapping, flags, re-hash checks), never decisions.
  'ai_result.stored': ['system'],
  'flag.reviewed': ['agency'],
  'rescore.recorded': ['master_assessor'],
  'recommendation.approved': ['awarding_body'],
  'sidh.exported': ['awarding_body'],
  'organisation.created': ['platform_admin'],
  'organisation.suspended': ['platform_admin'],
  // Each organisation admin within their own organisation; which roles is GRANTABLE_ROLES.
  'account.invited': ADMINS,
  'account.deactivated': ADMINS,
  'account.reactivated': ADMINS,
  'account.unlocked': ADMINS,
  'account.pin_reset': ADMINS,
  // Organisation admins for their own phones; the platform admin for any phone.
  'device.revoked': ADMINS,
  'trade_pack.uploaded': ['platform_admin'],
  // For the QPs the awarding body owns, and never by the person who uploaded it.
  'trade_pack.released': ['ab_admin'],
  // Only the awarding body accredits: an agency never accredits its own assessors.
  'accreditation.granted': ['ab_admin'],
  'venue.saved': ['tp_admin'],
} as const satisfies Record<Action, readonly Principal[]>;

/**
 * Decisions that only a person may make. No entry here may ever allow
 * `system` or an admin role; unit tests and the API's integration tests IT-03
 * and IT-04 check that.
 */
export const HUMAN_DECISIONS = [
  'route.decided',
  'calibration.scored',
  'score.recorded',
  'recommendation.signed',
  'rescore.recorded',
  'recommendation.approved',
] as const satisfies readonly Action[];

/**
 * Read access by role (README "Roles and permissions"). NCVET sees aggregates
 * only, never a single worker or session.
 */
export const READ_ACCESS = {
  'trade_packs.read': [
    'worker',
    'mobiliser',
    'assessor',
    'master_assessor',
    'agency',
    'awarding_body',
    'ncvet',
  ],
  'dashboard.read': ['agency', 'awarding_body', 'ncvet'],
  'sessions.read': ['agency', 'awarding_body'],
  'flags.read': ['agency'],
  'recommendations.read': ['agency', 'awarding_body'],
  'audit.verify': ['agency', 'awarding_body'],
  'rescoring.read': ['master_assessor'],
} as const satisfies Record<string, readonly Role[]>;
export type ReadScope = keyof typeof READ_ACCESS;

export function canRead(role: Role, scope: ReadScope): boolean {
  const allowed: readonly Role[] = READ_ACCESS[scope];
  return allowed.includes(role);
}

export function principalOf(actor: Actor): Principal {
  return actor.kind === 'system' ? 'system' : actor.role;
}

export function canPerform(actor: Actor, action: Action): boolean {
  const allowed: readonly Principal[] = AUTHORITY[action];
  return allowed.includes(principalOf(actor));
}

// --- Organisations and admin roles (ADR 010) ----------------------------------

/**
 * Which roles each kind of organisation may hold. Every role belongs to
 * exactly one kind, and an account never changes organisation or role.
 */
export const ROLES_BY_ORG_KIND = {
  operator: ['platform_admin'],
  // Workers belong to the training partner whose mobiliser registered them.
  // Never an assessor: the organisation that registers a worker never assesses them.
  training_partner: ['tp_admin', 'mobiliser', 'worker'],
  assessment_agency: ['agency_admin', 'agency', 'assessor'],
  // Masters sit with the awarding body (ADR 010 point 5, to confirm with CSDCI by 22 Oct).
  awarding_body: ['ab_admin', 'awarding_body', 'master_assessor'],
  regulator: ['ncvet'],
} as const satisfies Record<OrgKind, readonly Role[]>;

/**
 * Which roles each admin may grant by inviting an account. Organisation admins
 * grant only within their own organisation. The platform admin creates each
 * organisation's first admin, and NCVET's accounts because the regulator has
 * no admin, but never a working assessor or approver. Nobody grants `worker`:
 * a mobiliser registers workers.
 */
export const GRANTABLE_ROLES = {
  platform_admin: ['platform_admin', 'tp_admin', 'agency_admin', 'ab_admin', 'ncvet'],
  tp_admin: ['tp_admin', 'mobiliser'],
  agency_admin: ['agency_admin', 'agency', 'assessor'],
  ab_admin: ['ab_admin', 'awarding_body', 'master_assessor'],
} as const satisfies Record<AdminRole, readonly Role[]>;

/** How far a role's reads reach. `READ_ACCESS` says what it may read; this says whose. */
export const SCOPE_LEVELS = [
  /** What the account recorded or was assigned: its workers, sessions or re-score tasks. */
  'own_work',
  /** Everything of the account's own organisation that `READ_ACCESS` allows. */
  'own_org',
  /** Records for the QPs that the account's awarding body owns. */
  'owned_qps',
  /** National totals and rates, never a single worker, session or assessor. */
  'aggregates',
  /** Organisations, accounts, devices and the admin log, never case data. */
  'governance',
] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

/**
 * Each role's scope (ADR 010 point 6). The server derives it from the account,
 * never from the request; every read model takes it as a required parameter,
 * and a record outside it is "not found". Read models apply it from Sprint 2 (IT-05).
 */
export const SCOPE_BY_ROLE = {
  worker: 'own_work',
  mobiliser: 'own_work',
  assessor: 'own_work',
  master_assessor: 'owned_qps',
  agency: 'own_org',
  awarding_body: 'owned_qps',
  ncvet: 'aggregates',
  platform_admin: 'governance',
  tp_admin: 'own_org',
  agency_admin: 'own_org',
  ab_admin: 'own_org',
} as const satisfies Record<Role, ScopeLevel>;

/** Whether an organisation of this kind may hold accounts with this role. */
export function canHold(kind: OrgKind, role: Role): boolean {
  const roles: readonly Role[] = ROLES_BY_ORG_KIND[kind];
  return roles.includes(role);
}

/** Whether `granter` may invite an account with `role`. Only admins grant. */
export function canGrant(granter: Role, role: Role): boolean {
  const grantable: Partial<Record<Role, readonly Role[]>> = GRANTABLE_ROLES;
  return grantable[granter]?.includes(role) ?? false;
}

/**
 * Who may do what. Rule 1 in CLAUDE.md: AI suggests, people decide.
 *
 * Each action lists the principals allowed to perform it. `system` stands for
 * automated components (the on-device mapper and the server's queue worker).
 * The API enforces this table by role on every write, and the sync event
 * schema enforces it too, so a phone cannot even build a forbidden event.
 */
import type { Actor, Role } from './roles';

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
 * Admin actions (ADR 010), recorded in the hash-chained admin log. None of
 * them is a decision about a worker, and no deciding role may perform one.
 */
export const ADMIN_ACTION_TYPES = [
  'organisation.created',
  'organisation.suspended',
  'organisation.reactivated',
  'account.invited',
  'account.deactivated',
  'account.reactivated',
  'account.unlocked',
  'device.revoked',
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
  // Admin actions: people, organisations and phones, never a decision.
  'organisation.created': ['platform_admin'],
  'organisation.suspended': ['platform_admin'],
  'organisation.reactivated': ['platform_admin'],
  'account.invited': ADMINS,
  'account.deactivated': ADMINS,
  'account.reactivated': ADMINS,
  'account.unlocked': ADMINS,
  'device.revoked': ADMINS,
} as const satisfies Record<Action, readonly Principal[]>;

/**
 * Decisions that only a person may make. No entry here may ever allow
 * `system`; a unit test and the API's integration test IT-03 check that.
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
 * Every decision about a worker or their evidence (ADR 010 "Never allowed"):
 * no admin role and no automated component may hold any of these, and no role
 * that holds one may hold an admin action. Tests and IT-04 check both.
 */
export const DECISION_ACTIONS = [
  ...HUMAN_DECISIONS,
  'flag.reviewed',
  'sidh.exported',
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
  // Admin panel (ADR 010): each admin sees their own organisation; the platform
  // admin sees every organisation's accounts, phones masked, and no case data.
  'admin.organisations.read': ADMINS,
  'admin.people.read': ADMINS,
  'admin.devices.read': ADMINS,
  'admin.log.read': ADMINS,
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

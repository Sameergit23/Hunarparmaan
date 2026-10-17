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
  'ai_result.stored',
  'rescore.recorded',
  'recommendation.approved',
] as const;
export type ServerActionType = (typeof SERVER_ACTION_TYPES)[number];

export type Action = DeviceEventType | ServerActionType;

const ASSESSORS = ['assessor', 'master_assessor'] as const;

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
  // The queue worker stores AI results (mapping, flags, re-hash checks), never decisions.
  'ai_result.stored': ['system'],
  'rescore.recorded': ['master_assessor'],
  'recommendation.approved': ['awarding_body'],
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

export function principalOf(actor: Actor): Principal {
  return actor.kind === 'system' ? 'system' : actor.role;
}

export function canPerform(actor: Actor, action: Action): boolean {
  const allowed: readonly Principal[] = AUTHORITY[action];
  return allowed.includes(principalOf(actor));
}

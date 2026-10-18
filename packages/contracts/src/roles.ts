import { z } from 'zod';
import { EntityId } from './common';

/** The roles in a JWT (README "Roles and permissions", ADR 010). */
export const Role = z.enum([
  'worker',
  'mobiliser',
  'assessor',
  'master_assessor',
  'agency',
  'awarding_body',
  'ncvet',
  // Admins manage people, organisations and phones; they never decide (ADR 010).
  'platform_admin',
  'tp_admin',
  'agency_admin',
  'ab_admin',
]);
export type Role = z.infer<typeof Role>;

export const ADMIN_ROLES = ['platform_admin', 'tp_admin', 'agency_admin', 'ab_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(role: Role): role is AdminRole {
  return (ADMIN_ROLES as readonly Role[]).includes(role);
}

/** Organisations are the boundary of every account (ADR 010). */
export const OrgKind = z.enum([
  /** The HunarPramaan team. */
  'operator',
  /** An RPL centre that registers workers. */
  'training_partner',
  'assessment_agency',
  /** The Sector Skill Council that owns the QPs, CSDCI for our trade. */
  'awarding_body',
  /** NCVET. */
  'regulator',
]);
export type OrgKind = z.infer<typeof OrgKind>;

/**
 * Which roles an organisation of each kind may hold. A training partner never
 * holds assessors, so the organisation that registers a worker never assesses them.
 */
export const ROLES_BY_ORG_KIND = {
  operator: ['platform_admin'],
  training_partner: ['tp_admin', 'mobiliser'],
  assessment_agency: ['agency_admin', 'agency', 'assessor'],
  awarding_body: ['ab_admin', 'awarding_body', 'master_assessor'],
  regulator: ['ncvet'],
} as const satisfies Record<OrgKind, readonly Role[]>;

/**
 * Who may invite whom. The platform admin creates each organisation's first
 * admin (and NCVET's accounts) but never a working assessor or approver; each
 * organisation's admin invites its own staff, including a second admin.
 */
export const GRANTABLE_ROLES = {
  platform_admin: ['platform_admin', 'tp_admin', 'agency_admin', 'ab_admin', 'ncvet'],
  tp_admin: ['tp_admin', 'mobiliser'],
  agency_admin: ['agency_admin', 'agency', 'assessor'],
  ab_admin: ['ab_admin', 'awarding_body', 'master_assessor'],
} as const satisfies Record<AdminRole, readonly Role[]>;

/** Whether `inviter` may give `role` to a new account in an organisation of `kind`. */
export function canGrant(inviter: Role, role: Role, kind: OrgKind): boolean {
  if (!isAdminRole(inviter)) return false;
  const grantable: readonly Role[] = GRANTABLE_ROLES[inviter];
  const allowedHere: readonly Role[] = ROLES_BY_ORG_KIND[kind];
  return grantable.includes(role) && allowedHere.includes(role);
}

/**
 * Automated components that can act. They only ever produce suggestions:
 * see `authority.ts` for what they may and may not do.
 */
export const SystemService = z.enum(['device-mapper', 'queue-worker']);
export type SystemService = z.infer<typeof SystemService>;

export const Actor = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('user'), userId: EntityId, role: Role }),
  z.strictObject({ kind: z.literal('system'), service: SystemService }),
]);
export type Actor = z.infer<typeof Actor>;

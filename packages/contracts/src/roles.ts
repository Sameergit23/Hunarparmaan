import { z } from 'zod';
import { EntityId } from './common';

/**
 * The roles in a JWT (README "Roles and permissions"). Every account has one
 * role and one organisation, for good (ADR 010).
 */
export const Role = z.enum([
  'worker',
  'mobiliser',
  'assessor',
  'master_assessor',
  'agency',
  'awarding_body',
  'ncvet',
  // Admin roles (ADR 010): they manage people, organisations and phones, and never decide.
  'platform_admin',
  'tp_admin',
  'agency_admin',
  'ab_admin',
]);
export type Role = z.infer<typeof Role>;

/** The four admin roles. They hold only admin actions: see `authority.ts`. */
export const AdminRole = Role.extract(['platform_admin', 'tp_admin', 'agency_admin', 'ab_admin']);
export type AdminRole = z.infer<typeof AdminRole>;

/**
 * Kinds of organisation (ADR 010). Every account belongs to one; which roles
 * each kind may hold is `ROLES_BY_ORG_KIND` in `authority.ts`.
 */
export const OrgKind = z.enum([
  /** The HunarPramaan team. */
  'operator',
  /** An RPL centre that registers workers. */
  'training_partner',
  /** Employs assessors. */
  'assessment_agency',
  /** Owns QPs and approves results, such as CSDCI. */
  'awarding_body',
  /** NCVET. */
  'regulator',
]);
export type OrgKind = z.infer<typeof OrgKind>;

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

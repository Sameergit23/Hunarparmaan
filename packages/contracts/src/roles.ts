import { z } from 'zod';
import { EntityId } from './common';

/** The roles in a JWT (README "Roles and permissions"). */
export const Role = z.enum([
  'worker',
  'mobiliser',
  'assessor',
  'master_assessor',
  'agency',
  'awarding_body',
  'ncvet',
]);
export type Role = z.infer<typeof Role>;

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

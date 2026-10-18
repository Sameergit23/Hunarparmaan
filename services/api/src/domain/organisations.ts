/**
 * Organisations (ADR 010): every account belongs to one, of one kind, for
 * good, and the kind decides which roles it may hold (`canHold`). Creating
 * organisations on screen is phase 2; the pilot's are made by migration 0008,
 * with the fixed ids below.
 */
import { eq } from 'drizzle-orm';
import {
  ROLES_BY_ORG_KIND,
  type LocalizedText,
  type OrgKind,
  type Role,
} from '@hunarpramaan/contracts';
import type { Db, Tx } from '../db/client';
import { organisations } from '../db/schema';

/** The pilot's organisations, one of each kind. Migration 0008 inserts them with these ids. */
export const PILOT_ORGANISATIONS = {
  operator: {
    id: '00000000-0000-4000-8000-000000000101',
    name: { en: 'HunarPramaan', hi: 'हुनर प्रमाण' },
  },
  awarding_body: {
    id: '00000000-0000-4000-8000-000000000102',
    name: { en: 'CSDCI', hi: 'CSDCI' },
  },
  assessment_agency: {
    id: '00000000-0000-4000-8000-000000000103',
    name: { en: 'Indore Assessment Agency', hi: 'इंदौर असेसमेंट एजेंसी' },
  },
  training_partner: {
    id: '00000000-0000-4000-8000-000000000104',
    name: { en: 'Indore RPL Centre', hi: 'इंदौर RPL केंद्र' },
  },
  regulator: {
    id: '00000000-0000-4000-8000-000000000105',
    name: { en: 'NCVET', hi: 'NCVET' },
  },
} as const satisfies Record<OrgKind, { id: string; name: LocalizedText }>;

/** The kind of organisation that holds `role`. Every role belongs to exactly one. */
export function orgKindOf(role: Role): OrgKind {
  for (const [kind, roles] of Object.entries(ROLES_BY_ORG_KIND) as [OrgKind, readonly Role[]][]) {
    if (roles.includes(role)) return kind;
  }
  throw new Error(`no organisation kind holds ${role}`);
}

/** The pilot organisation that holds `role`, for accounts made before a real one is chosen. */
export const pilotOrganisationFor = (role: Role): string => PILOT_ORGANISATIONS[orgKindOf(role)].id;

export async function findOrganisation(db: Db | Tx, id: string) {
  const [row] = await db.select().from(organisations).where(eq(organisations.id, id));
  return row ?? null;
}

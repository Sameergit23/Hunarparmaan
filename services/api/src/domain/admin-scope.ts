/**
 * Whose accounts, phones and admin log an admin reaches (ADR 010 point 6, TRD
 * section 6.2). It is derived on the server from the account, never from the
 * request; every admin read model and action takes it, and anything outside
 * it is "not found", never told apart from missing.
 */
import {
  GRANTABLE_ROLES,
  SCOPE_BY_ROLE,
  canGrant,
  type Role,
  type SessionUser,
} from '@hunarpramaan/contracts';
import { forbidden } from '../http/errors';

export interface AdminScope {
  /** `governance`: the platform admin, across organisations; `own_org`: one organisation. */
  level: 'governance' | 'own_org';
  adminId: string;
  adminRole: Role;
  organisationId: string;
}

export function adminScope(admin: SessionUser): AdminScope {
  const level = SCOPE_BY_ROLE[admin.role];
  if (level !== 'governance' && level !== 'own_org') {
    throw forbidden(`${admin.role} has no admin scope`);
  }
  return { level, adminId: admin.id, adminRole: admin.role, organisationId: admin.organisationId };
}

/**
 * Accounts some admin may grant. Workers aren't among them: a mobiliser
 * registers them, and no admin manages them (PRD section 4).
 */
const MANAGED_ROLES = new Set<Role>(Object.values(GRANTABLE_ROLES).flat());

/** Whether the admin sees this account: managed, and in their organisation unless governance. */
export function canSee(scope: AdminScope, account: { organisationId: string; role: Role }) {
  return (
    MANAGED_ROLES.has(account.role) &&
    (scope.level === 'governance' || account.organisationId === scope.organisationId)
  );
}

/**
 * Whether the admin may act on this account: one whose role they could grant.
 * For organisation admins that is their own staff; for the platform admin,
 * only admins and NCVET accounts (TRD section 6.1, step 4).
 */
export function canActOn(scope: AdminScope, account: { organisationId: string; role: Role }) {
  return canSee(scope, account) && canGrant(scope.adminRole, account.role);
}

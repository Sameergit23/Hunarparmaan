/**
 * Whose case data an office or field account reads (ADR 010 point 6, IT-05).
 * It is derived on the server from the account, never from the request; every
 * case-data read model takes it, and a record outside it is "not found".
 */
import { eq, sql, type SQL } from 'drizzle-orm';
import { SCOPE_BY_ROLE, type ScopeLevel, type SessionUser } from '@hunarpramaan/contracts';
import { sessions } from '../db/schema';

export interface Scope {
  level: ScopeLevel;
  userId: string;
  organisationId: string;
}

export const scopeOf = (user: SessionUser): Scope => ({
  level: SCOPE_BY_ROLE[user.role],
  userId: user.id,
  organisationId: user.organisationId,
});

/** National totals, such as the public study results. Never a single record. */
export const NATIONAL: Scope = { level: 'aggregates', userId: '', organisationId: '' };

type SessionRow = Pick<typeof sessions.$inferSelect, 'agencyId' | 'ownerId' | 'assessorId'>;

/**
 * The sessions in scope, as a condition on `sessions`: the agency's own, the
 * awarding body's QPs, an assessor's own work, or every one for national
 * aggregates. The admin panel's governance scope reaches no case data.
 */
export function sessionsWhere(scope: Scope): SQL | undefined {
  switch (scope.level) {
    case 'own_org':
      return eq(sessions.agencyId, scope.organisationId);
    case 'owned_qps':
      return eq(sessions.ownerId, scope.organisationId);
    case 'own_work':
      return eq(sessions.assessorId, scope.userId);
    case 'aggregates':
      return undefined;
    case 'governance':
      return sql`false`;
  }
}

/** The same rule for one session already loaded. */
export function sessionInScope(scope: Scope, session: SessionRow): boolean {
  switch (scope.level) {
    case 'own_org':
      return session.agencyId === scope.organisationId;
    case 'owned_qps':
      return session.ownerId === scope.organisationId;
    case 'own_work':
      return session.assessorId === scope.userId;
    case 'aggregates':
      return true;
    case 'governance':
      return false;
  }
}

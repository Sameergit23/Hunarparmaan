import { describe, expect, it } from 'vitest';
import {
  ADMIN_ACTION_TYPES,
  AUTHORITY,
  DECISION_ACTIONS,
  HUMAN_DECISIONS,
  canPerform,
  type Action,
} from './authority';
import { assessor, deviceMapper, mobiliser, queueWorker, worker } from './test/fixtures';
import { ADMIN_ROLES, ROLES_BY_ORG_KIND, Role, canGrant, isAdminRole, type Actor } from './roles';

const awardingBody: Actor = { ...assessor, role: 'awarding_body' } as Actor;

describe('authority (rule 1: AI suggests, people decide)', () => {
  it.each(HUMAN_DECISIONS)('no automated component may perform %s', (action) => {
    expect(AUTHORITY[action]).not.toContain('system');
    expect(canPerform(queueWorker, action)).toBe(false);
    expect(canPerform(deviceMapper, action)).toBe(false);
  });

  it('only assessors can score and sign', () => {
    for (const action of ['score.recorded', 'recommendation.signed'] as const) {
      expect(canPerform(assessor, action)).toBe(true);
      expect(canPerform(mobiliser, action)).toBe(false);
      expect(canPerform(worker, action)).toBe(false);
      expect(canPerform(awardingBody, action)).toBe(false);
    }
  });

  it('only the awarding body can approve', () => {
    expect(canPerform(awardingBody, 'recommendation.approved')).toBe(true);
    expect(canPerform(assessor, 'recommendation.approved')).toBe(false);
  });

  it('lets the system store AI results, which are suggestions', () => {
    expect(canPerform(queueWorker, 'ai_result.stored')).toBe(true);
    expect(canPerform(deviceMapper, 'mapping.suggested')).toBe(true);
    expect(canPerform(assessor, 'ai_result.stored')).toBe(false);
  });

  it('gives every action at least one principal', () => {
    for (const [action, principals] of Object.entries(AUTHORITY) as [Action, readonly string[]][]) {
      expect(principals.length, action).toBeGreaterThan(0);
    }
  });
});

describe('server actions', () => {
  const agency: Actor = {
    kind: 'user',
    userId: assessor.kind === 'user' ? assessor.userId : '',
    role: 'agency',
  };

  it('lets only the agency review flags', () => {
    expect(canPerform(agency, 'flag.reviewed')).toBe(true);
    expect(canPerform(assessor, 'flag.reviewed')).toBe(false);
    expect(canPerform(queueWorker, 'flag.reviewed')).toBe(false);
  });

  it('lets field staff, not offices, register a device', () => {
    expect(canPerform(assessor, 'device.registered')).toBe(true);
    expect(canPerform(mobiliser, 'device.registered')).toBe(true);
    expect(canPerform(agency, 'device.registered')).toBe(false);
  });
});

describe('admins never decide (ADR 010, unit half of IT-04)', () => {
  it('gives no admin role, and no automated component, any decision', () => {
    for (const action of DECISION_ACTIONS) {
      const allowed: readonly string[] = AUTHORITY[action];
      for (const role of ADMIN_ROLES) expect(allowed, action).not.toContain(role);
      expect(allowed, action).not.toContain('system');
    }
  });

  it('gives no deciding role any admin action', () => {
    const deciders = new Set<string>(DECISION_ACTIONS.flatMap((a) => [...AUTHORITY[a]]));
    for (const action of ADMIN_ACTION_TYPES) {
      for (const principal of AUTHORITY[action])
        expect(deciders.has(principal), action).toBe(false);
    }
  });

  it('lets only the platform admin create or suspend organisations', () => {
    expect(AUTHORITY['organisation.created']).toEqual(['platform_admin']);
    expect(AUTHORITY['organisation.suspended']).toEqual(['platform_admin']);
  });
});

describe('who may grant which role', () => {
  it('lets each organisation hold only its own kinds of roles', () => {
    expect(canGrant('tp_admin', 'mobiliser', 'training_partner')).toBe(true);
    expect(canGrant('tp_admin', 'assessor', 'training_partner')).toBe(false);
    expect(canGrant('agency_admin', 'assessor', 'assessment_agency')).toBe(true);
    expect(canGrant('agency_admin', 'master_assessor', 'assessment_agency')).toBe(false);
    expect(canGrant('ab_admin', 'master_assessor', 'awarding_body')).toBe(true);
  });

  it('lets the platform admin create first admins and NCVET accounts, never an assessor or approver', () => {
    expect(canGrant('platform_admin', 'agency_admin', 'assessment_agency')).toBe(true);
    expect(canGrant('platform_admin', 'ncvet', 'regulator')).toBe(true);
    expect(canGrant('platform_admin', 'assessor', 'assessment_agency')).toBe(false);
    expect(canGrant('platform_admin', 'awarding_body', 'awarding_body')).toBe(false);
  });

  it('refuses every grant from a role that is not an admin', () => {
    for (const role of Role.options.filter((r) => !isAdminRole(r))) {
      expect(canGrant(role, 'assessor', 'assessment_agency')).toBe(false);
    }
  });

  it('never lets a training partner hold a role that assesses or approves', () => {
    const allowed: readonly string[] = ROLES_BY_ORG_KIND.training_partner;
    for (const role of ['assessor', 'master_assessor', 'awarding_body', 'agency']) {
      expect(allowed).not.toContain(role);
    }
  });
});

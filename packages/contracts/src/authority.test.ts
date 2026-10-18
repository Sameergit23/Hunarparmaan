import { describe, expect, it } from 'vitest';
import {
  ADMIN_ACTION_TYPES,
  AUTHORITY,
  DEVICE_EVENT_TYPES,
  GRANTABLE_ROLES,
  HUMAN_DECISIONS,
  READ_ACCESS,
  ROLES_BY_ORG_KIND,
  SCOPE_BY_ROLE,
  SERVER_ACTION_TYPES,
  canGrant,
  canHold,
  canPerform,
  type Action,
  type Principal,
  type ReadScope,
} from './authority';
import { assessor, deviceMapper, ids, mobiliser, queueWorker, worker } from './test/fixtures';
import { AdminRole, OrgKind, Role, type Actor } from './roles';

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

const principals = (action: Action): readonly Principal[] => AUTHORITY[action];
const admins: readonly Principal[] = AdminRole.options;
/** Every role that holds at least one decision. */
const deciders = new Set(HUMAN_DECISIONS.flatMap((action) => principals(action)));

describe('IT-04 (unit): admins never decide', () => {
  it.each(HUMAN_DECISIONS)('no admin role may perform %s', (action) => {
    for (const admin of AdminRole.options) {
      expect(principals(action)).not.toContain(admin);
      expect(canPerform({ kind: 'user', userId: ids.v4(), role: admin }, action)).toBe(false);
    }
  });

  it.each(ADMIN_ACTION_TYPES)('no deciding role may perform %s', (action) => {
    for (const decider of deciders) expect(principals(action)).not.toContain(decider);
  });

  it('gives admin roles only admin actions: no phone event, flag review or SIDH export', () => {
    for (const action of [...DEVICE_EVENT_TYPES, ...SERVER_ACTION_TYPES]) {
      for (const admin of admins) expect(principals(action), action).not.toContain(admin);
    }
  });

  it('gives admin actions only to admin roles, never to the system or another role', () => {
    for (const action of ADMIN_ACTION_TYPES) {
      expect(principals(action).length, action).toBeGreaterThan(0);
      for (const principal of principals(action)) expect(admins, action).toContain(principal);
    }
  });

  it('keeps case data away from admin roles', () => {
    const caseData: ReadScope[] = [
      'dashboard.read',
      'sessions.read',
      'flags.read',
      'recommendations.read',
      'audit.verify',
      'rescoring.read',
    ];
    for (const scope of caseData) {
      const readers: readonly Role[] = READ_ACCESS[scope];
      for (const admin of AdminRole.options) expect(readers, scope).not.toContain(admin);
    }
    expect(SCOPE_BY_ROLE.platform_admin).toBe('governance');
  });

  it('needs two people to release a trade pack', () => {
    expect(principals('trade_pack.uploaded')).toEqual(['platform_admin']);
    expect(principals('trade_pack.released')).toEqual(['ab_admin']);
  });
});

describe('organisations and grants (ADR 010)', () => {
  it('puts every role in exactly one kind of organisation', () => {
    for (const role of Role.options) {
      const kinds = OrgKind.options.filter((kind) => canHold(kind, role));
      expect(kinds, role).toHaveLength(1);
    }
  });

  it('gives each kind at most one admin role, and the regulator none', () => {
    for (const kind of OrgKind.options) {
      const kindAdmins = AdminRole.options.filter((admin) => canHold(kind, admin));
      expect(kindAdmins.length, kind).toBe(kind === 'regulator' ? 0 : 1);
    }
  });

  it('never lets a training partner hold an assessor', () => {
    const roles: readonly Role[] = ROLES_BY_ORG_KIND.training_partner;
    expect(roles).not.toContain('assessor');
    expect(roles).not.toContain('master_assessor');
  });

  it('lets organisation admins grant only roles their own organisation can hold', () => {
    for (const admin of ['tp_admin', 'agency_admin', 'ab_admin'] as const) {
      const kind = OrgKind.options.find((k) => canHold(k, admin))!;
      for (const role of GRANTABLE_ROLES[admin]) expect(canHold(kind, role), role).toBe(true);
    }
  });

  it('never lets the platform admin create an account that decides', () => {
    for (const role of GRANTABLE_ROLES.platform_admin) {
      expect(deciders.has(role), role).toBe(false);
    }
    expect(canGrant('platform_admin', 'assessor')).toBe(false);
    expect(canGrant('platform_admin', 'awarding_body')).toBe(false);
  });

  it('lets only admins grant, and nobody grant a worker', () => {
    for (const role of Role.options) {
      expect(canGrant(role, 'worker')).toBe(false);
      if (!admins.includes(role)) {
        for (const target of Role.options) expect(canGrant(role, target)).toBe(false);
      }
    }
    expect(canGrant('agency_admin', 'assessor')).toBe(true);
    expect(canGrant('agency_admin', 'master_assessor')).toBe(false);
  });

  it('gives NCVET aggregates only, and field roles their own work only', () => {
    expect(SCOPE_BY_ROLE.ncvet).toBe('aggregates');
    for (const role of ['worker', 'mobiliser', 'assessor'] as const) {
      expect(SCOPE_BY_ROLE[role]).toBe('own_work');
    }
  });
});

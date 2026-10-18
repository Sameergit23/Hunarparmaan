import { describe, expect, it } from 'vitest';
import { ADMIN_REASON_CODES, AdminReasonCode, reasonFits } from './admin';
import { CreateInviteRequest } from './api';
import { ADMIN_ACTION_TYPES } from './authority';
import { ids } from './test/fixtures';

/** The admin actions built for G2 (phase 1 of the admin panel). */
const PHASE_1 = [
  'account.invited',
  'account.deactivated',
  'account.reactivated',
  'account.unlocked',
  'account.pin_reset',
  'device.revoked',
] as const;

describe('admin reason codes (ADR 011: codes, never free text)', () => {
  it.each(PHASE_1)('gives %s at least one reason code', (action) => {
    expect(ADMIN_REASON_CODES[action].length).toBeGreaterThan(0);
  });

  it('only lists admin actions', () => {
    for (const action of Object.keys(ADMIN_REASON_CODES)) {
      expect(ADMIN_ACTION_TYPES).toContain(action);
    }
  });

  it('keeps the bootstrap reason for the first platform admin invite', () => {
    expect(reasonFits('account.invited', 'bootstrap')).toBe(true);
    for (const action of PHASE_1.filter((a) => a !== 'account.invited')) {
      expect(reasonFits(action, 'bootstrap')).toBe(false);
    }
  });

  it('refuses a reason from another action, and actions with no codes yet', () => {
    expect(reasonFits('account.deactivated', 'left_organisation')).toBe(true);
    expect(reasonFits('account.deactivated', 'forgot_pin')).toBe(false);
    expect(reasonFits('venue.saved', 'new_staff')).toBe(false);
  });

  it('parses every listed code, and no free text', () => {
    for (const code of Object.values(ADMIN_REASON_CODES).flat()) {
      expect(AdminReasonCode.safeParse(code).success).toBe(true);
    }
    expect(AdminReasonCode.safeParse('Anil left last week').success).toBe(false);
  });
});

describe('invites', () => {
  it('may name the organisation, for the platform admin', () => {
    const invite = { phone: '9876543210', name: 'Asha Verma', role: 'agency_admin' };
    expect(CreateInviteRequest.safeParse(invite).success).toBe(true);
    expect(CreateInviteRequest.safeParse({ ...invite, organisationId: ids.v4() }).success).toBe(
      true,
    );
    expect(CreateInviteRequest.safeParse({ ...invite, organisationId: 'csdci' }).success).toBe(
      false,
    );
  });
});

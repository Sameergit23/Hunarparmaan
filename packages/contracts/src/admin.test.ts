import { describe, expect, it } from 'vitest';
import {
  ADMIN_REASON_CODES,
  AdminReasonCode,
  CreateInviteRequest,
  DEVICE_STATUS_FOR_REASON,
  DeactivateRequest,
  MaskedPhone,
  RevokeDeviceRequest,
  maskPhone,
  reasonFits,
} from './admin';
import { ADMIN_ACTION_TYPES, ADMIN_READ_SCOPES, READ_ACCESS, type ReadScope } from './authority';
import { AdminRole, type Role } from './roles';
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

describe('admin writes carry a reason and the PIN (FR-30)', () => {
  const invite = {
    phone: '9876543210',
    name: 'Asha Verma',
    role: 'agency_admin',
    reason: 'new_staff',
    pin: '305718',
  };

  it('needs both on an invite, which may name the organisation', () => {
    expect(CreateInviteRequest.safeParse(invite).success).toBe(true);
    expect(CreateInviteRequest.safeParse({ ...invite, organisationId: ids.v4() }).success).toBe(
      true,
    );
    const { pin: _, ...withoutPin } = invite;
    expect(CreateInviteRequest.safeParse(withoutPin).success).toBe(false);
    // The bootstrap reason is only for the command line.
    expect(CreateInviteRequest.safeParse({ ...invite, reason: 'bootstrap' }).success).toBe(false);
  });

  it("takes only the action's own reasons", () => {
    expect(DeactivateRequest.safeParse({ reason: 'left_organisation', pin: '1234' }).success).toBe(
      true,
    );
    expect(DeactivateRequest.safeParse({ reason: 'forgot_pin', pin: '1234' }).success).toBe(false);
  });

  it('lets the reason decide what happens to a phone', () => {
    for (const [reason, status] of Object.entries(DEVICE_STATUS_FOR_REASON)) {
      expect(RevokeDeviceRequest.safeParse({ reason, status, pin: '1234' }).success).toBe(true);
    }
    expect(
      RevokeDeviceRequest.safeParse({ reason: 'stolen', status: 'retired', pin: '1234' }).success,
    ).toBe(false);
    expect(
      RevokeDeviceRequest.safeParse({ reason: 'lost', status: 'registered', pin: '1234' }).success,
    ).toBe(false);
  });
});

describe('admin reads (NFR-11)', () => {
  it('masks a number to its last 4 digits', () => {
    expect(maskPhone('9000003210')).toBe('XXXXXX3210');
    expect(maskPhone('+919000003210')).toBe('XXXXXX3210');
    expect(MaskedPhone.safeParse(maskPhone('9876543210')).success).toBe(true);
    expect(MaskedPhone.safeParse('9876543210').success).toBe(false);
  });

  it('gives admin roles the admin scopes and nothing else', () => {
    for (const [scope, readers] of Object.entries(READ_ACCESS) as [ReadScope, readonly Role[]][]) {
      const admin: readonly string[] = ADMIN_READ_SCOPES;
      const adminReaders = readers.filter((r) => AdminRole.safeParse(r).success);
      if (admin.includes(scope)) {
        // Admin scopes reach no deciding role; NCVET reads governance counts only.
        const others = readers.filter((r) => !AdminRole.safeParse(r).success);
        expect(others, scope).toEqual(scope === 'governance_log.read' ? ['ncvet'] : []);
      } else {
        expect(adminReaders, scope).toEqual([]);
      }
    }
  });
});

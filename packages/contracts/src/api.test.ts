import { describe, expect, it } from 'vitest';
import {
  ApproveRequest,
  BLOCKING_FLAGS,
  FlagKind,
  LoginRequest,
  OtpRequest,
  SignRequest,
} from './api';
import { READ_ACCESS, canRead } from './authority';
import { ids } from './test/fixtures';

describe('API contracts', () => {
  it('accepts Indian mobile numbers with or without +91', () => {
    expect(OtpRequest.safeParse({ phone: '9876543210' }).success).toBe(true);
    expect(OtpRequest.safeParse({ phone: '+919876543210' }).success).toBe(true);
    expect(OtpRequest.safeParse({ phone: '12345' }).success).toBe(false);
  });

  it('requires a 6-digit OTP and a 4 to 6 digit PIN', () => {
    const base = { challengeId: ids.v4(), otp: '123456', pin: '1234' };
    expect(LoginRequest.safeParse(base).success).toBe(true);
    expect(LoginRequest.safeParse({ ...base, otp: '12345' }).success).toBe(false);
    expect(LoginRequest.safeParse({ ...base, pin: '12' }).success).toBe(false);
  });

  it('needs a note to return a recommendation, but not to approve it', () => {
    expect(ApproveRequest.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(ApproveRequest.safeParse({ decision: 'returned' }).success).toBe(false);
    expect(
      ApproveRequest.safeParse({ decision: 'returned', note: 'Clip 3 is too dark to judge' })
        .success,
    ).toBe(true);
  });

  it('signs online with the same payload as offline, minus the session id', () => {
    expect(SignRequest.shape).not.toHaveProperty('sessionId');
    expect(SignRequest.shape).toHaveProperty('scoreEventIds');
  });

  it('only blocks approval on known flag kinds', () => {
    for (const kind of BLOCKING_FLAGS) expect(FlagKind.options).toContain(kind);
  });
});

describe('read access', () => {
  it('lets NCVET see aggregates only', () => {
    expect(canRead('ncvet', 'dashboard.read')).toBe(true);
    expect(canRead('ncvet', 'sessions.read')).toBe(false);
    expect(canRead('ncvet', 'flags.read')).toBe(false);
  });

  it('keeps blind re-score tasks to master assessors', () => {
    expect(READ_ACCESS['rescoring.read']).toEqual(['master_assessor']);
  });
});

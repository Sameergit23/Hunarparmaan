import { describe, expect, it } from 'vitest';
import { BlockerCode, FlagKind, type MessageParams } from '@hunarpramaan/contracts';
import { fill } from './i18n/fill';
import { en } from './i18n/en';
import { hi } from './i18n/hi';
import { adminErrorText, blockerText, flagText, signInErrorText } from './messages';

const params: MessageParams = {
  criterionId: 'L3-N1.PC1',
  metres: 900,
  minutes: 180,
  seq: 4,
  reason: 'outcome',
  signed: 'pass',
  actual: 'fail',
  date: '2026-10-13',
  type: 'score.recorded',
  deviceId: 'demo-phone',
  criteria: 'L3-N2.PC1',
};

// The path to every string in a dictionary. Paths are arrays: some keys contain dots.
function leaves(value: unknown, path: string[] = []): string[][] {
  if (typeof value === 'string') return [path];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
  }
  return [];
}
const at = (obj: unknown, path: string[]) =>
  path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string;
const name = (path: string[]) => path.join(' > ');

describe('rule 7: every string exists in Hindi and English', () => {
  it('has the same keys in both dictionaries', () => {
    expect(leaves(hi).map(name).sort()).toEqual(leaves(en).map(name).sort());
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const path of leaves(en)) {
      expect(placeholders(at(hi, path)), name(path)).toEqual(placeholders(at(en, path)));
    }
  });
});

describe.each([
  ['en', en],
  ['hi', hi],
] as const)('flag and blocker wording in %s', (lang, m) => {
  it.each(FlagKind.options)('words the %s flag with every value filled', (kind) => {
    const text = flagText({ kind, params }, m, lang);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it.each(BlockerCode.options)('words the %s blocker with every value filled', (code) => {
    const text = blockerText({ code, params }, m, lang);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it('translates the outcome inside a mismatch', () => {
    expect(blockerText({ code: 'result_mismatch', params }, m, lang)).toContain(
      m.sessions.outcome.pass,
    );
  });

  it('says whether drained work came from a deactivated account or a retired phone', () => {
    const drained = (extra: MessageParams) =>
      flagText({ kind: 'drained_work', params: { ...params, ...extra } }, m, lang);
    expect(drained({ by: 'account' })).toBe(fill(m.detail.drained_work, params));
    expect(drained({ by: 'phone' })).toBe(fill(m.detail.drained_work_phone, params));
    expect(drained({ by: 'phone', when: 'after' })).toBe(m.detail.started_after_retirement);
    expect(
      blockerText({ code: 'started_after_deactivation', params: { by: 'account' } }, m, lang),
    ).toBe(m.detail.started_after_deactivation);
  });
});

describe.each([
  ['en', en],
  ['hi', hi],
] as const)('sign-in error wording in %s', (lang, m) => {
  const error = (code: string, details: string[] = []) => ({
    status: 400,
    code,
    message: 'English from the API, never shown',
    details,
  });

  it.each(['rate_limited', 'pin_rejected', 'wrong_pin', 'invite_invalid', 'phone_in_use'])(
    'words %s with every value filled',
    (code) => {
      const text = signInErrorText(error(code, ['length']), m, lang);
      expect(text?.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/\{\w+\}/);
    },
  );

  it('says until when an account is locked', () => {
    const text = signInErrorText(
      error('account_locked', ['until:2026-11-24T06:15:00.000Z']),
      m,
      lang,
    );
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).toMatch(/11:45/);
  });

  it('tells an easy PIN from a short one', () => {
    expect(signInErrorText(error('pin_rejected', ['easy']), m, lang)).toBe(m.pin.easy);
    expect(signInErrorText(error('pin_rejected', ['length']), m, lang)).toContain('6');
  });

  it('leaves other codes to the page', () => {
    expect(signInErrorText(error('unauthorized'), m, lang)).toBeNull();
  });
});

describe.each([
  ['en', en],
  ['hi', hi],
] as const)('admin error wording in %s', (lang, m) => {
  const error = (code: string, status = 409, details: string[] = []) => ({
    status,
    code,
    message: 'English from the API, never shown',
    details,
  });

  it.each([
    'step_up_required',
    'self_action',
    'last_admin',
    'role_not_grantable',
    'role_not_in_org',
    'not_issuer',
    'phone_in_use',
    'organisation_suspended',
    'rate_limited',
    'not_found',
    'conflict',
  ])('words %s in its own words', (code) => {
    const text = adminErrorText(error(code), m, lang);
    expect(text).toBe(m.admin.errors[code as keyof typeof m.admin.errors]);
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it('never says where a number in use belongs, nor tells the person to sign in', () => {
    expect(adminErrorText(error('phone_in_use'), m, lang)).not.toBe(m.invite.existing);
  });

  it('says until when the admin is locked', () => {
    const text = adminErrorText(
      error('account_locked', 423, ['until:2026-11-24T06:15:00.000Z']),
      m,
      lang,
    );
    expect(text).toMatch(/11:45/);
  });

  it('falls back to plain words for anything else', () => {
    expect(adminErrorText(error('bad_request', 400), m, lang)).toBe(m.admin.errors.invalid);
    expect(adminErrorText(error('internal', 500), m, lang)).toBe(m.admin.errors.unreachable);
  });
});

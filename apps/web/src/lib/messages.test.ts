import { describe, expect, it } from 'vitest';
import { BlockerCode, FlagKind, type MessageParams } from '@hunarpramaan/contracts';
import { en } from './i18n/en';
import { hi } from './i18n/hi';
import { blockerText, flagText, signInErrorText } from './messages';

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

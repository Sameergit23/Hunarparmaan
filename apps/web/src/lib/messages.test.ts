import { describe, expect, it } from 'vitest';
import { AiCheckStatus, BlockerCode, FlagKind, type MessageParams } from '@hunarpramaan/contracts';
import { en } from './i18n/en';
import { hi } from './i18n/hi';
import { aiCheckText, aiSeenAt, blockerText, flagText } from './messages';

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
] as const)('AI check wording in %s', (_lang, m) => {
  const checks = ['ppe.gloves', 'ppe.helmet', 'ppe.shoes', 'ppe.goggles', 'work.joint_insulated'];

  it.each(checks)('names %s and words its fault', (check) => {
    expect(m.aiChecks[check]).toBeTruthy();
    expect(m.aiServer.fault[check]).toBeTruthy();
  });

  it.each(AiCheckStatus.options)('words a %s check with every value filled', (status) => {
    for (const reason of [null, 'not_visible', 'no_hazard_seen'] as const) {
      const text = aiCheckText(
        { check: 'ppe.goggles', status, confidence: 0.82, reason, frameTimes: [12] },
        m,
      );
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/\{\w+\}/);
    }
  });

  it('gives the confidence and the times in the clip', () => {
    const raised = {
      check: 'ppe.gloves',
      status: 'raised' as const,
      confidence: 0.816,
      reason: null,
      frameTimes: [17.5, 71],
    };
    expect(aiCheckText(raised, m)).toContain('82%');
    expect(aiSeenAt(raised, m)).toContain('0:17, 1:11');
    expect(aiSeenAt({ ...raised, frameTimes: [0] }, m)).toBe('');
  });

  it('words a check it has no name for', () => {
    const text = aiCheckText(
      { check: 'ppe.harness', status: 'raised', confidence: 0.6, reason: null, frameTimes: [] },
      m,
    );
    expect(text).toContain('ppe.harness');
  });
});

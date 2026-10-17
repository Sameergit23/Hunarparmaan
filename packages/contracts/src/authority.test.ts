import { describe, expect, it } from 'vitest';
import { AUTHORITY, HUMAN_DECISIONS, canPerform, type Action } from './authority';
import { assessor, deviceMapper, mobiliser, queueWorker, worker } from './test/fixtures';
import type { Actor } from './roles';

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

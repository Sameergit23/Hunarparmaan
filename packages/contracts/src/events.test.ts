import { describe, expect, it } from 'vitest';
import { seal, verifyChain, type ChainLink } from '@hunarpramaan/audit';
import { SyncEvent, SyncPushRequest } from './events';
import {
  assessor,
  deviceMapper,
  envelope,
  gps,
  ids,
  mobiliser,
  queueWorker,
  worker,
} from './test/fixtures';
import type { Actor } from './roles';

const SESSION = ids.v4();
const flag = (raised: boolean) => ({
  check: 'ppe.gloves',
  raised,
  confidence: 0.82,
  source: 'device' as const,
});

function scoreEvent(
  value: 0 | 1 | 2,
  extra: Record<string, unknown> = {},
  actor: Actor = assessor,
) {
  return {
    ...envelope(actor),
    type: 'score.recorded',
    payload: {
      sessionId: SESSION,
      criterionId: 'NOS-A.PC1',
      value,
      evidenceIds: [ids.v7()],
      aiFlags: [],
      ...extra,
    },
  };
}

function messages(value: unknown): string[] {
  const result = SyncEvent.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('SyncEvent', () => {
  it('accepts a score from an assessor', () => {
    expect(messages(scoreEvent(2))).toEqual([]);
  });

  it('IT-03 (schema level): rejects a score created by an AI job', () => {
    expect(messages(scoreEvent(2, {}, queueWorker))).toEqual([
      'system may not create score.recorded',
    ]);
    expect(messages(scoreEvent(2, {}, deviceMapper))).toHaveLength(1);
  });

  it('rejects a score from a worker or mobiliser', () => {
    expect(messages(scoreEvent(1, {}, worker))).toEqual(['worker may not create score.recorded']);
    expect(messages(scoreEvent(1, {}, mobiliser))).toHaveLength(1);
  });

  it('FR-08: full marks despite a raised flag needs a reason', () => {
    expect(messages(scoreEvent(2, { aiFlags: [flag(true)] }))).toEqual([
      expect.stringMatching(/needs a one-line reason/),
    ]);
    expect(
      messages(scoreEvent(2, { aiFlags: [flag(true)], conflictReason: 'Gloves are on; glare' })),
    ).toEqual([]);
  });

  it('does not ask for a reason when the score agrees with the flags', () => {
    expect(messages(scoreEvent(1, { aiFlags: [flag(true)] }))).toEqual([]);
    expect(messages(scoreEvent(2, { aiFlags: [flag(false)] }))).toEqual([]);
  });

  it('accepts a correction that supersedes an earlier score', () => {
    expect(messages(scoreEvent(1, { supersedes: ids.v7() }))).toEqual([]);
  });

  it('rule 4: requires a time-ordered UUIDv7 event id', () => {
    expect(messages({ ...scoreEvent(2), id: ids.v4() }).length).toBeGreaterThan(0);
  });

  it('rejects a score outside 0/1/2', () => {
    expect(messages(scoreEvent(3 as 2)).length).toBeGreaterThan(0);
  });

  it('FR-04: overriding the suggested route needs a reason', () => {
    const decided = (extra: Record<string, unknown>) => ({
      ...envelope(mobiliser),
      type: 'route.decided',
      payload: {
        declarationId: ids.v4(),
        nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
        route: 'direct_assessment',
        suggested: { nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI', route: 'bridge_module' },
        ...extra,
      },
    });
    expect(messages(decided({}))).toEqual([expect.stringMatching(/needs a reason/)]);
    expect(messages(decided({ reason: 'Showed 10 years of site work in person' }))).toEqual([]);
  });

  it('rule 8: refuses an Aadhaar number where an eKYC reference belongs', () => {
    const started = (ekycRef: string) => ({
      ...envelope(assessor),
      type: 'session.started',
      payload: {
        sessionId: SESSION,
        workerId: ids.v4(),
        nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
        packVersion: '2026.10.0',
        ekycRef,
        startPhotoSha256: 'b'.repeat(64),
        gps,
      },
    });
    expect(messages(started('1234 5678 9012'))).toEqual([
      expect.stringMatching(/looks like an Aadhaar number/),
    ]);
    expect(messages(started('123456789012'))).toHaveLength(1);
    expect(messages(started('EKYC-REF-7f3a9c'))).toEqual([]);
  });

  it('rejects an unknown event type', () => {
    expect(messages({ ...scoreEvent(2), type: 'score.deleted' }).length).toBeGreaterThan(0);
  });
});

describe('SyncPushRequest', () => {
  it('rejects events from another device in the same push', () => {
    const result = SyncPushRequest.safeParse({
      protocol: 1,
      deviceId: 'device-02',
      events: [scoreEvent(2)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown protocol version', () => {
    const result = SyncPushRequest.safeParse({
      protocol: 2,
      deviceId: 'device-01',
      events: [scoreEvent(2)],
    });
    expect(result.success).toBe(false);
  });
});

describe('events as hash-chain entries', () => {
  it('seals events into a chain that verifies and still matches the schema', () => {
    let prev: ChainLink | null = null;
    const chain: ChainLink[] = [];
    for (const value of [2, 1] as const) {
      const { seq: _seq, prevHash: _prev, hash: _hash, ...body } = scoreEvent(value);
      prev = seal(prev, body);
      chain.push(prev);
    }

    expect(verifyChain(chain)).toMatchObject({ ok: true, count: 2 });
    for (const event of chain) expect(messages(event)).toEqual([]);
    expect(
      SyncPushRequest.safeParse({ protocol: 1, deviceId: 'device-01', events: chain }).success,
    ).toBe(true);
  });
});

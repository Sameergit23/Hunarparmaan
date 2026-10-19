import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SimulatedPhone } from '../src/dev/simulated-phone';
import { VisionRejected, VisionUnavailable, type VisionClient } from '../src/ai/vision';
import { aiResults, rescoreTasks, scores } from '../src/db/schema';
import { startHarness, PACK, type Harness, type TestUser } from '../src/test/harness';
import {
  buildAssessment,
  pushOk,
  registerWorker,
  signPayload,
  uploadAll,
  type Assessment,
} from '../src/test/scenario';

let h: Harness;
let assessor: TestUser;
let agency: TestUser;
let master: TestUser;
let phone: SimulatedPhone;
let workerId: string;

const GLOVES_CRITERION = 'L3-N1.PC1';
const AI_CHECKS = new Map(
  PACK.qualifications[0]!.nos.flatMap((n) => n.criteria.map((c) => [c.id, c.aiChecks] as const)),
);
const SUPPORTED = new Set(['ppe.gloves', 'ppe.helmet', 'ppe.shoes', 'ppe.goggles']);
const BOX: [number, number, number, number] = [0.1, 0.5, 0.3, 0.8];

/**
 * A stand-in for the AI service: raises `ppe.gloves` on the clip for
 * GLOVES_CRITERION (the demo clips' bytes name their criterion) and clears
 * every other check it knows.
 */
function fakeVision(behaviour: 'ok' | 'down' | 'unreadable' = 'ok') {
  const calls: { mimeType: string; checks: readonly string[]; bytes: number }[] = [];
  const client: VisionClient = {
    async check(media, mimeType, checks) {
      calls.push({ mimeType, checks, bytes: media.length });
      if (behaviour === 'down') throw new VisionUnavailable('AI service unreachable');
      if (behaviour === 'unreadable') throw new VisionRejected('unreadable_media');
      const bare = new TextDecoder().decode(media).includes(GLOVES_CRITERION);
      const raised = (check: string) => bare && check === 'ppe.gloves';
      return {
        engine: 'fake@0000000+rules.1',
        media: { kind: 'video', frames: 6, durationSec: 42 },
        results: checks
          .filter((c) => SUPPORTED.has(c))
          .map((check) => ({
            check,
            status: raised(check) ? ('raised' as const) : ('clear' as const),
            confidence: raised(check) ? 0.82 : 0.7,
            reason: null,
            frames: [{ index: 2, timeSec: 17.5, score: 0.41, box: BOX }],
          })),
        unsupported: checks.filter((c) => !SUPPORTED.has(c)),
      };
    },
  };
  return { client, calls };
}

beforeAll(async () => {
  h = await startHarness();
  const mobiliser = await h.user('mobiliser');
  assessor = await h.user('assessor', 'Anil Sharma');
  agency = await h.user('agency');
  master = await h.user('master_assessor');
  phone = await h.phone(assessor);
  workerId = await registerWorker(h, mobiliser, await h.phone(mobiliser));
});
afterEach(() => {
  h.deps.vision = null;
});
afterAll(() => h.close());

async function assessed(scores?: Partial<Record<string, 0 | 1 | 2>>): Promise<Assessment> {
  const a = buildAssessment(h, phone, workerId, scores ? { scores } : {});
  await pushOk(h, assessor, phone, a.events);
  return a;
}

const resultsFor = (sessionId: string) =>
  h.db.select().from(aiResults).where(eq(aiResults.sessionId, sessionId));

describe('AI checks on verified clips (README "AI workflow", step 3)', () => {
  it('stores the suggestions for each clip whose criterion asks for a check', async () => {
    const vision = fakeVision();
    h.deps.vision = vision.client;
    const a = await assessed();
    await uploadAll(h, assessor, a);

    const withChecks = [...a.clips.keys()].filter((id) => (AI_CHECKS.get(id) ?? []).length > 0);
    expect(vision.calls).toHaveLength(withChecks.length);
    expect(vision.calls[0]).toMatchObject({ mimeType: 'video/mp4' });
    expect(vision.calls.map((c) => c.checks)).toEqual(withChecks.map((id) => AI_CHECKS.get(id)));

    const rows = await resultsFor(a.sessionId);
    // Criteria whose checks the service cannot do yet (step order, meter reading) store nothing.
    const stored = withChecks.filter((id) => AI_CHECKS.get(id)!.some((c) => SUPPORTED.has(c)));
    expect(rows.map((r) => r.criterionId).sort()).toEqual(stored.sort());
    const gloves = rows.find((r) => r.criterionId === GLOVES_CRITERION)!;
    expect(gloves.evidenceId).toBe(a.clips.get(GLOVES_CRITERION)!.evidenceId);
    expect(gloves.engine).toBe('fake@0000000+rules.1');
    expect(gloves.checks[0]).toMatchObject({
      check: 'ppe.gloves',
      status: 'raised',
      confidence: 0.82,
    });
  });

  it('IT-03: never writes or changes a score', async () => {
    h.deps.vision = fakeVision().client;
    const a = await assessed();
    const before = await h.db.select().from(scores).where(eq(scores.sessionId, a.sessionId));
    await uploadAll(h, assessor, a);
    const after = await h.db.select().from(scores).where(eq(scores.sessionId, a.sessionId));
    expect(after).toEqual(before);
    expect(after.every((s) => s.value === 2)).toBe(true);
    expect((await resultsFor(a.sessionId)).length).toBeGreaterThan(0);
  });

  it('shows the results beside the score on the session view, as hints', async () => {
    h.deps.vision = fakeVision().client;
    const a = await assessed();
    await uploadAll(h, assessor, a);
    const res = await h.http.get(`/v1/sessions/${a.sessionId}`).set(agency.auth);
    expect(res.status).toBe(200);
    const criterion = res.body.criteria.find(
      (c: { criterionId: string }) => c.criterionId === GLOVES_CRITERION,
    );
    expect(criterion.score).toBe(2);
    expect(criterion.aiFlags).toEqual([]);
    expect(criterion.aiResults).toEqual([
      {
        evidenceId: a.clips.get(GLOVES_CRITERION)!.evidenceId,
        engine: 'fake@0000000+rules.1',
        createdAt: expect.any(String),
        checks: [
          {
            check: 'ppe.gloves',
            status: 'raised',
            confidence: 0.82,
            reason: null,
            frameTimes: [17.5],
          },
          {
            check: 'ppe.goggles',
            status: 'clear',
            confidence: 0.7,
            reason: null,
            frameTimes: [17.5],
          },
        ],
      },
    ]);
  });

  it('sends a raised check beside full marks to a blind re-score (FR-13)', async () => {
    h.deps.vision = fakeVision().client;
    const a = await assessed({ [GLOVES_CRITERION]: 2 });
    await uploadAll(h, assessor, a);
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', signPayload(a))]);
    const tasks = await h.db
      .select()
      .from(rescoreTasks)
      .where(eq(rescoreTasks.sessionId, a.sessionId));
    expect(tasks).toEqual([
      expect.objectContaining({ criterionId: GLOVES_CRITERION, reason: 'flagged' }),
    ]);
    const queue = await h.http.get('/v1/rescoring').set(master.auth);
    expect(queue.status).toBe(200);
    expect(queue.body.map((t: { evidenceId: string }) => t.evidenceId)).toContain(
      a.clips.get(GLOVES_CRITERION)!.evidenceId,
    );
  });

  it('also when the clip is checked after the session was signed', async () => {
    h.deps.vision = fakeVision().client;
    const a = await assessed();
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', signPayload(a))]);
    expect(
      await h.db.select().from(rescoreTasks).where(eq(rescoreTasks.sessionId, a.sessionId)),
    ).toEqual([]);
    await uploadAll(h, assessor, a);
    const tasks = await h.db
      .select()
      .from(rescoreTasks)
      .where(eq(rescoreTasks.sessionId, a.sessionId));
    expect(tasks.map((t) => [t.criterionId, t.reason])).toEqual([[GLOVES_CRITERION, 'flagged']]);
  });

  it('does not re-score when the assessor did not give full marks', async () => {
    h.deps.vision = fakeVision().client;
    const a = await assessed({ [GLOVES_CRITERION]: 1 });
    await uploadAll(h, assessor, a);
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', signPayload(a))]);
    expect(
      await h.db.select().from(rescoreTasks).where(eq(rescoreTasks.sessionId, a.sessionId)),
    ).toEqual([]);
  });

  it('does not analyse a clip whose bytes do not match its capture hash', async () => {
    const vision = fakeVision();
    h.deps.vision = vision.client;
    const a = await assessed();
    const clip = a.clips.get(GLOVES_CRITERION)!;
    const put = await h.http
      .put(`/v1/evidence/${clip.evidenceId}/content`)
      .set(assessor.auth)
      .set('Content-Type', 'video/mp4')
      .send(Buffer.from('edited clip'));
    expect(put.status).toBe(422);
    await h.http.post(`/v1/evidence/${clip.evidenceId}/complete`).set(assessor.auth);
    expect(vision.calls).toEqual([]);
    expect(await resultsFor(a.sessionId)).toEqual([]);
  });

  it('keeps the upload working when the AI service is down or refuses a clip', async () => {
    for (const behaviour of ['down', 'unreadable'] as const) {
      const vision = fakeVision(behaviour);
      h.deps.vision = vision.client;
      const a = await assessed();
      await uploadAll(h, assessor, a); // expects 204 and 202 for every clip
      expect(vision.calls.length).toBeGreaterThan(0);
      expect(await resultsFor(a.sessionId)).toEqual([]);
    }
  });

  it('sends nothing without AI_SERVICE_URL', async () => {
    const a = await assessed();
    await uploadAll(h, assessor, a);
    expect(await resultsFor(a.sessionId)).toEqual([]);
  });

  it('stores one result per clip and engine, however often the job runs', async () => {
    h.deps.vision = fakeVision().client;
    const a = await assessed();
    await uploadAll(h, assessor, a);
    const evidenceId = a.clips.get(GLOVES_CRITERION)!.evidenceId;
    await h.deps.queue.add({ name: 'evidence.vision', data: { evidenceId } });
    const rows = (await resultsFor(a.sessionId)).filter((r) => r.evidenceId === evidenceId);
    expect(rows).toHaveLength(1);
  });
});

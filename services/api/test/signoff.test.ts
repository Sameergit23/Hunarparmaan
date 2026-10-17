import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { SimulatedPhone } from '../src/dev/simulated-phone';
import { startHarness, type Harness, type TestUser } from '../src/test/harness';
import {
  buildAssessment,
  pushOk,
  registerWorker,
  signPayload,
  uploadAll,
} from '../src/test/scenario';

let h: Harness;
let mobiliser: TestUser;
let assessor: TestUser;
let master: TestUser;
let awardingBody: TestUser;
let agency: TestUser;
let ncvet: TestUser;
let phone: SimulatedPhone;
let workerId: string;

beforeAll(async () => {
  h = await startHarness();
  mobiliser = await h.user('mobiliser', 'Sunita Verma');
  assessor = await h.user('assessor', 'Anil Sharma');
  master = await h.user('master_assessor', 'Meena Iyer');
  awardingBody = await h.user('awarding_body', 'CSDCI Desk');
  agency = await h.user('agency', 'Agency Desk');
  ncvet = await h.user('ncvet', 'NCVET Desk');
  phone = await h.phone(assessor);
  workerId = await registerWorker(h, mobiliser, await h.phone(mobiliser));
});
afterAll(() => h.close());

/** An assessed, uploaded and signed session. */
async function signedSession(scores?: Partial<Record<string, 0 | 1 | 2>>, device = phone) {
  const a = buildAssessment(h, device, workerId, scores ? { scores } : {});
  await pushOk(h, assessor, device, a.events);
  await uploadAll(h, assessor, a);
  const payload = signPayload(a);
  await pushOk(h, assessor, device, [device.event('recommendation.signed', payload)]);
  return { a, recommendationId: payload.recommendationId };
}

const approve = (id: string, user: TestUser, body: object = { decision: 'approved' }) =>
  h.http.post(`/v1/recommendations/${id}/approve`).set(user.auth).send(body);

describe('the full flow (E2E-01, server side)', () => {
  it('goes from signed recommendation to an approved, verifiable certificate', async () => {
    const { a, recommendationId } = await signedSession();

    const detail = await h.http.get(`/v1/sessions/${a.sessionId}`).set(agency.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('signed');
    expect(detail.body.evidence.every((e: { check: string }) => e.check === 'verified')).toBe(true);
    expect(detail.body.recommendation.blockers).toEqual([]);

    const res = await approve(recommendationId, awardingBody);
    expect(res.status).toBe(201);
    expect(res.body.certificateId).toMatch(/^HP-[0-9A-Z]{10}$/);

    const verify = await h.http.get(`/v1/certificates/${res.body.certificateId}/verify`);
    expect(verify.body).toMatchObject({
      valid: true,
      holder: 'Ramesh K.',
      nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
      nsqfLevel: 3,
    });

    const exported = await h.http.post('/v1/exports/sidh').set(awardingBody.auth);
    expect(exported.body.mock).toBe(true);
    expect(exported.body.records.map((r: { certificateId: string }) => r.certificateId)).toContain(
      res.body.certificateId,
    );
  });

  it('says a made-up certificate id is not valid', async () => {
    const res = await h.http.get('/v1/certificates/HP-NOTREAL000/verify');
    expect(res.body).toEqual({ valid: false, certificateId: 'HP-NOTREAL000' });
  });

  it('approves a fail without issuing a certificate', async () => {
    const zeros = Object.fromEntries(
      ['L3-N1.PC1', 'L3-N1.PC2', 'L3-N1.PC3', 'L3-N2.PC1'].map((id) => [id, 0 as const]),
    );
    const { recommendationId } = await signedSession(zeros);
    const res = await approve(recommendationId, awardingBody);
    expect(res.body).toMatchObject({ decision: 'approved', certificateId: null });
  });

  it('cannot decide the same recommendation twice', async () => {
    const { recommendationId } = await signedSession();
    await approve(recommendationId, awardingBody);
    const again = await approve(recommendationId, awardingBody);
    expect(again.status).toBe(409);
  });

  it('needs a note to return a recommendation', async () => {
    const { recommendationId } = await signedSession();
    expect((await approve(recommendationId, awardingBody, { decision: 'returned' })).status).toBe(
      400,
    );
    const res = await approve(recommendationId, awardingBody, {
      decision: 'returned',
      note: 'Clip 3 is too dark',
    });
    expect(res.body).toMatchObject({ decision: 'returned', certificateId: null });
  });
});

describe('IT-02: tampering', () => {
  it('rejects and flags a clip whose bytes do not match its captured hash, and blocks approval', async () => {
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    const [first, ...rest] = [...a.clips.values()];
    const tampered = await h.http
      .put(`/v1/evidence/${first!.evidenceId}/content`)
      .set(assessor.auth)
      .send(Buffer.from('an edited clip'));
    expect(tampered.status).toBe(422);
    for (const clip of rest) {
      await h.http
        .put(`/v1/evidence/${clip.evidenceId}/content`)
        .set(assessor.auth)
        .send(Buffer.from(clip.bytes));
      await h.http.post(`/v1/evidence/${clip.evidenceId}/complete`).set(assessor.auth);
    }
    const payload = signPayload(a);
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', payload)]);

    const res = await approve(payload.recommendationId, awardingBody);
    expect(res.status).toBe(409);
    expect(res.body.error.details.join(' ')).toMatch(/does not match its hash/);

    const flagsRes = await h.http.get('/v1/flags').set(agency.auth);
    expect(flagsRes.body).toContainEqual(
      expect.objectContaining({ kind: 'hash_mismatch', evidenceId: first!.evidenceId }),
    );
  });

  it('blocks approval while a clip is not uploaded', async () => {
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    const payload = signPayload(a);
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', payload)]);
    const res = await approve(payload.recommendationId, awardingBody);
    expect(res.status).toBe(409);
    expect(res.body.error.details).toContainEqual(
      expect.stringMatching(/not uploaded and checked yet/),
    );
  });

  it('fails chain verification at the row that was edited in the database, and blocks approval', async () => {
    // Its own phone: once a chain is broken, every session on that device is blocked.
    const { a, recommendationId } = await signedSession(undefined, await h.phone(assessor));
    const ok = await h.http.get(`/v1/audit/sessions/${a.sessionId}/verify`).set(agency.auth);
    expect(ok.body.ok).toBe(true);

    // An attacker with database access edits one stored score (bypassing the append-only trigger).
    const target = a.scoreEventIds[2]!;
    await h.db.execute(sql`alter table audit_entries disable trigger audit_entries_append_only`);
    await h.db.execute(
      sql`update audit_entries set payload = jsonb_set(payload, '{value}', '0') where id = ${target}`,
    );
    await h.db.execute(sql`alter table audit_entries enable trigger audit_entries_append_only`);
    const [row] = (
      (await h.db.execute(sql`select seq from audit_entries where id = ${target}`)) as unknown as {
        rows: { seq: number }[];
      }
    ).rows;

    const res = await h.http.get(`/v1/audit/sessions/${a.sessionId}/verify`).set(agency.auth);
    expect(res.body.ok).toBe(false);
    expect(res.body.devices[0]).toMatchObject({
      ok: false,
      failedAtSeq: row!.seq,
      reason: 'hash_mismatch',
    });

    const approval = await approve(recommendationId, awardingBody);
    expect(approval.status).toBe(409);
    expect(approval.body.error.details.join(' ')).toMatch(/hash chain .* fails at seq/);
  });

  it('flags a signed result that does not match the scores, and blocks approval', async () => {
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    await uploadAll(h, assessor, a);
    const payload = signPayload(a, { aggregate: 0.95 });
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', payload)]);
    const res = await approve(payload.recommendationId, awardingBody);
    expect(res.status).toBe(409);
    expect(res.body.error.details.join(' ')).toMatch(/result mismatch/);
  });
});

describe('IT-03: authority', () => {
  it('lets only an awarding-body token approve', async () => {
    const { recommendationId } = await signedSession();
    for (const user of [assessor, master, agency, ncvet, mobiliser]) {
      const res = await approve(recommendationId, user);
      expect(res.status, user.role).toBe(403);
    }
    expect((await approve(recommendationId, awardingBody)).status).toBe(201);
  });

  it('lets only an assessor token sign online', async () => {
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    const { sessionId: _sessionId, ...body } = signPayload(a);
    for (const user of [awardingBody, agency, mobiliser]) {
      const res = await h.http.post(`/v1/sessions/${a.sessionId}/sign`).set(user.auth).send(body);
      expect(res.status, user.role).toBe(403);
    }
    const res = await h.http.post(`/v1/sessions/${a.sessionId}/sign`).set(assessor.auth).send(body);
    expect(res.status).toBe(201);
  });

  it('refuses an online signature whose result does not match the scores', async () => {
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    const { sessionId: _sessionId, ...body } = signPayload(a, { outcome: 'fail' });
    const res = await h.http.post(`/v1/sessions/${a.sessionId}/sign`).set(assessor.auth).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatch(/signed fail, but the scores give pass/);
  });

  it("does not let an assessor sign another assessor's session", async () => {
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    const other = await h.user('assessor', 'Another Assessor');
    const { sessionId: _sessionId, ...body } = signPayload(a);
    const res = await h.http.post(`/v1/sessions/${a.sessionId}/sign`).set(other.auth).send(body);
    expect(res.status).toBe(409);
  });

  it('keeps NCVET to aggregates', async () => {
    expect((await h.http.get('/v1/dashboard/summary').set(ncvet.auth)).status).toBe(200);
    expect((await h.http.get('/v1/sessions').set(ncvet.auth)).status).toBe(403);
    expect((await h.http.get('/v1/flags').set(ncvet.auth)).status).toBe(403);
  });

  it('needs a token for everything under /v1 except the public routes', async () => {
    expect((await h.http.get('/v1/sessions')).status).toBe(401);
    expect(
      (await h.http.get('/v1/sessions').set('Authorization', 'Bearer not-a-token')).status,
    ).toBe(401);
    expect((await h.http.get('/v1/public/study')).status).toBe(200);
  });
});

describe('blind re-scoring (FR-13)', () => {
  it('samples clips when a session is signed and lets a master assessor re-score them blind', async () => {
    h.setDice(0); // every clip falls inside the random sample
    const { a } = await signedSession();
    h.setDice(0.99);

    const queue = await h.http.get('/v1/rescoring').set(master.auth);
    expect(queue.status).toBe(200);
    const tasks = queue.body.filter((t: { evidenceId: string }) =>
      [...a.clips.values()].some((c) => c.evidenceId === t.evidenceId),
    );
    expect(tasks).toHaveLength(a.clips.size);
    expect(tasks[0]).not.toHaveProperty('score');
    expect(tasks[0].rubric['2'].en).toBeTruthy();

    for (const [i, task] of tasks.entries()) {
      const value = i === 0 ? 1 : 2; // one disagreement out of eight
      const res = await h.http
        .post('/v1/rescoring')
        .set(master.auth)
        .send({ taskId: task.taskId, value });
      expect(res.status).toBe(201);
    }
    const again = await h.http
      .post('/v1/rescoring')
      .set(master.auth)
      .send({ taskId: tasks[0].taskId, value: 2 });
    expect(again.status).toBe(409);

    const report = await h.http.get('/v1/dashboard/agreement').set(agency.auth);
    const row = report.body.assessors.find((r: { name: string }) => r.name === 'Anil Sharma');
    expect(row).toMatchObject({ rescored: 8, agreement: 7 / 8, outlier: false });
  });

  it('only shows re-score tasks to master assessors', async () => {
    expect((await h.http.get('/v1/rescoring').set(assessor.auth)).status).toBe(403);
  });
});

describe('online route override (FR-04)', () => {
  it('records a mobiliser override with its reason', async () => {
    const declarationId = uuidv4();
    const mobilePhone = await h.phone(mobiliser);
    await pushOk(h, mobiliser, mobilePhone, [
      mobilePhone.event('declaration.recorded', {
        declarationId,
        workerId,
        language: 'hi',
        source: 'vosk',
        asrTranscript: 'pandrah saal se ghar ki wiring karta hoon',
        transcript: '15 saal se ghar ki wiring karta hoon, MCB lagata hoon',
      }),
    ]);
    const res = await h.http
      .post(`/v1/declarations/${declarationId}/override`)
      .set(mobiliser.auth)
      .send({
        nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
        route: 'direct_assessment',
        reason: 'Showed his site work in person',
      });
    expect(res.status).toBe(201);
    const noReason = await h.http
      .post(`/v1/declarations/${declarationId}/override`)
      .set(mobiliser.auth)
      .send({ nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI', route: 'direct_assessment' });
    expect(noReason.status).toBe(400);
  });
});

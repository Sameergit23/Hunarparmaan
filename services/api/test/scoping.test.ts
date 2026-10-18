/**
 * IT-05: organisations are kept apart (ADR 010 point 6). Two agencies never
 * see each other's sessions, flags or numbers; an awarding body sees and
 * approves only the QPs it owns, and its masters re-score only those; a
 * mobiliser acts only on workers it registered. Outside scope is "not found".
 * The admin half (people, phones, the admin log) is in admin-views.test.ts.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { sessions } from '../src/db/schema';
import type { SimulatedPhone } from '../src/dev/simulated-phone';
import { PILOT_ORGANISATIONS } from '../src/domain/organisations';
import { L3, startHarness, type Harness, type TestUser } from '../src/test/harness';
import {
  VENUE,
  buildAssessment,
  pushOk,
  registerWorker,
  signPayload,
  uploadAll,
} from '../src/test/scenario';

let h: Harness;
let bhopal: string;
let otherBody: string;
const people = {} as Record<
  | 'indoreDesk'
  | 'bhopalDesk'
  | 'anil'
  | 'vikram'
  | 'csdci'
  | 'otherDesk'
  | 'master'
  | 'otherMaster'
  | 'ncvet'
  | 'mobiliser'
  | 'otherMobiliser',
  TestUser
>;
let mobiliserPhone: SimulatedPhone;
const done = {} as Record<'anil' | 'vikram', { sessionId: string; recommendationId: string }>;

/** An assessed, uploaded and signed session; `away` records a clip far from the venue. */
async function signedSession(assessor: TestUser, away = false) {
  const phone = await h.phone(assessor);
  const workerId = await registerWorker(
    h,
    people.mobiliser,
    mobiliserPhone,
    `Worker ${assessor.name}`,
  );
  const far = { ...VENUE, lat: VENUE.lat + 0.01 };
  const a = buildAssessment(h, phone, workerId, away ? { gps: far } : {});
  await pushOk(h, assessor, phone, a.events);
  await uploadAll(h, assessor, a);
  const payload = signPayload(a);
  await pushOk(h, assessor, phone, [phone.event('recommendation.signed', payload)]);
  return { sessionId: a.sessionId, recommendationId: payload.recommendationId };
}

beforeAll(async () => {
  h = await startHarness();
  bhopal = await h.organisation('assessment_agency', 'Bhopal Skills Assessment');
  otherBody = await h.organisation('awarding_body', 'Another Sector Skill Council');
  people.indoreDesk = await h.user('agency', 'Indore Desk');
  people.bhopalDesk = await h.user('agency', 'Bhopal Desk', { organisationId: bhopal });
  people.anil = await h.user('assessor', 'Anil Sharma');
  people.vikram = await h.user('assessor', 'Vikram Rathore', { organisationId: bhopal });
  people.csdci = await h.user('awarding_body', 'CSDCI Desk');
  people.otherDesk = await h.user('awarding_body', 'Other Desk', { organisationId: otherBody });
  people.master = await h.user('master_assessor', 'Meena Iyer');
  people.otherMaster = await h.user('master_assessor', 'Other Master', {
    organisationId: otherBody,
  });
  people.ncvet = await h.user('ncvet');
  people.mobiliser = await h.user('mobiliser', 'Sunita Verma');
  people.otherMobiliser = await h.user('mobiliser', 'Other Mobiliser');
  mobiliserPhone = await h.phone(people.mobiliser);
  // Every clip is sampled for blind re-scoring.
  h.setDice(0);
  done.anil = await signedSession(people.anil);
  done.vikram = await signedSession(people.vikram, true);
  h.setDice(0.99);
});
afterAll(() => h.close());

const get = (user: TestUser, path: string) => h.http.get(path).set(user.auth);
const ids = (body: { id: string }[]) => body.map((s) => s.id);

describe('IT-05: agencies are kept apart', () => {
  it('copies the agency and the QP owner onto each session', async () => {
    const [row] = await h.db.select().from(sessions).where(eq(sessions.id, done.vikram.sessionId));
    expect(row).toMatchObject({
      agencyId: bhopal,
      ownerId: PILOT_ORGANISATIONS.awarding_body.id,
      nqrCode: L3,
    });
  });

  it("lists only the agency's own sessions, and another agency's is not found", async () => {
    expect(ids((await get(people.indoreDesk, '/v1/sessions')).body)).toEqual([done.anil.sessionId]);
    expect(ids((await get(people.bhopalDesk, '/v1/sessions')).body)).toEqual([
      done.vikram.sessionId,
    ]);
    for (const path of [
      `/v1/sessions/${done.vikram.sessionId}`,
      `/v1/audit/sessions/${done.vikram.sessionId}/verify`,
    ]) {
      const res = await get(people.indoreDesk, path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    expect((await get(people.bhopalDesk, `/v1/sessions/${done.vikram.sessionId}`)).status).toBe(
      200,
    );
  });

  it("shows and reviews only the agency's own flags", async () => {
    const theirs = await get(people.bhopalDesk, '/v1/flags');
    const geofence = theirs.body.find((f: { kind: string }) => f.kind === 'geofence');
    expect(geofence).toBeDefined();
    const ours = await get(people.indoreDesk, '/v1/flags');
    expect(ids(ours.body)).not.toContain(geofence.id);

    const review = (user: TestUser) =>
      h.http
        .post(`/v1/flags/${geofence.id}/review`)
        .set(user.auth)
        .send({ note: 'Checked the venue' });
    expect((await review(people.indoreDesk)).status).toBe(404);
    expect((await review(people.bhopalDesk)).status).toBe(201);
  });

  it('counts only the agency’s own work, while NCVET sees national totals', async () => {
    const summary = async (user: TestUser) => (await get(user, '/v1/dashboard/summary')).body;
    expect(await summary(people.indoreDesk)).toMatchObject({ sessions: 1, workers: 1 });
    expect(await summary(people.bhopalDesk)).toMatchObject({ sessions: 1, workers: 1 });
    expect((await summary(people.ncvet)).sessions).toBe(2);
    // An agency with no sessions yet sees zeros, not an error.
    const empty = await h.user('agency', 'New Desk', {
      organisationId: await h.organisation('assessment_agency'),
    });
    expect(await summary(empty)).toMatchObject({ sessions: 0, workers: 0, evidenceTotal: 0 });

    const agreement = await get(people.indoreDesk, '/v1/dashboard/agreement');
    const names = agreement.body.assessors.map((a: { name: string }) => a.name);
    expect(names).toContain('Anil Sharma');
    expect(names).not.toContain('Vikram Rathore');
  });
});

describe('IT-05: awarding bodies and masters keep to the QPs they own', () => {
  it('lets only the owner of the QP see and approve its recommendations', async () => {
    const pending = await get(people.csdci, '/v1/recommendations');
    expect(pending.body.map((r: { id: string }) => r.id).sort()).toEqual(
      [done.anil.recommendationId, done.vikram.recommendationId].sort(),
    );
    expect((await get(people.otherDesk, '/v1/recommendations')).body).toEqual([]);
    expect((await get(people.otherDesk, '/v1/sessions')).body).toEqual([]);

    const approve = (user: TestUser) =>
      h.http
        .post(`/v1/recommendations/${done.anil.recommendationId}/approve`)
        .set(user.auth)
        .send({ decision: 'approved' });
    expect((await approve(people.otherDesk)).status).toBe(404);
    expect((await approve(people.csdci)).status).toBe(201);
  });

  it("gives a master blind re-scores only for its awarding body's QPs", async () => {
    const tasks = await get(people.master, '/v1/rescoring');
    expect(tasks.body.length).toBeGreaterThan(0);
    expect((await get(people.otherMaster, '/v1/rescoring')).body).toEqual([]);

    const pull = await h.http.get('/v1/sync/pull').set(people.otherMaster.auth);
    expect(pull.body.items.filter((i: { type: string }) => i.type === 'rescore_task')).toEqual([]);

    const rescore = await h.http
      .post('/v1/rescoring')
      .set(people.otherMaster.auth)
      .send({ taskId: tasks.body[0].taskId, value: 2 });
    expect(rescore.status).toBe(404);
  });
});

describe('IT-05: mobilisers act on their own work', () => {
  it('lets a mobiliser change the route only for a worker it registered', async () => {
    const workerId = await registerWorker(h, people.mobiliser, mobiliserPhone, 'Pooja Patel');
    const declarationId = uuidv4();
    await pushOk(h, people.mobiliser, mobiliserPhone, [
      mobiliserPhone.event('declaration.recorded', {
        declarationId,
        workerId,
        language: 'hi',
        source: 'vosk',
        asrTranscript: 'das saal se wiring',
        transcript: '10 saal se wiring karti hoon',
      }),
    ]);
    const override = (user: TestUser) =>
      h.http
        .post(`/v1/declarations/${declarationId}/override`)
        .set(user.auth)
        .send({ nqrCode: L3, route: 'bridge_module', reason: 'Wants the bridge course first' });
    expect((await override(people.otherMobiliser)).status).toBe(404);
    expect((await override(people.mobiliser)).status).toBe(201);
  });
});

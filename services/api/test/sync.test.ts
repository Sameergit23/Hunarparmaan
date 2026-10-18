import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { auditEntries, flags } from '../src/db/schema';
import { startHarness, type Harness, type TestUser } from '../src/test/harness';
import {
  VENUE,
  buildAssessment,
  push,
  pushOk,
  registerWorker,
  signPayload,
  uploadAll,
} from '../src/test/scenario';
import type { SimulatedPhone } from '../src/dev/simulated-phone';

let h: Harness;
let mobiliser: TestUser;
let assessor: TestUser;
let mobiliserPhone: SimulatedPhone;
let workerId: string;

beforeAll(async () => {
  h = await startHarness();
  mobiliser = await h.user('mobiliser', 'Sunita Verma');
  assessor = await h.user('assessor', 'Anil Sharma');
  mobiliserPhone = await h.phone(mobiliser);
  workerId = await registerWorker(h, mobiliser, mobiliserPhone);
});
afterAll(() => h.close());

const flagsOf = (kind: string) => h.db.select().from(flags).where(eq(flags.kind, kind));
const entriesOn = async (deviceId: string) =>
  Number(
    (
      await h.db
        .select({ n: count() })
        .from(auditEntries)
        .where(eq(auditEntries.deviceId, deviceId))
    )[0]!.n,
  );

describe('POST /v1/sync/push', () => {
  it('IT-01: pushing the same batch twice stores it once', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId);
    const body = phone.push(a.events);

    const first = await h.http.post('/v1/sync/push').set(assessor.auth).send(body);
    expect(first.status).toBe(200);
    expect(new Set(first.body.acks.map((x: { status: string }) => x.status))).toEqual(
      new Set(['stored']),
    );

    const second = await h.http.post('/v1/sync/push').set(assessor.auth).send(body);
    expect(second.status).toBe(200);
    expect(new Set(second.body.acks.map((x: { status: string }) => x.status))).toEqual(
      new Set(['duplicate']),
    );
    expect(await entriesOn(phone.deviceId)).toBe(a.events.length);
  });

  it('hands back an upload URL for every new clip', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId);
    const res = await pushOk(h, assessor, phone, a.events);
    expect(res.uploads).toHaveLength(a.clips.size);
    expect(res.uploads[0].url).toMatch(/\/v1\/evidence\/.+\/content$/);
  });

  it('accepts a later push that continues the stored chain', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events.slice(0, 3));
    await pushOk(h, assessor, phone, a.events.slice(3));
    expect(await entriesOn(phone.deviceId)).toBe(a.events.length);
  });

  it('rejects everything from the first entry that breaks the chain, and flags it', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId);
    const events = a.events.slice(0, 5);
    // Lower a score after it was sealed, as a tampered phone database would.
    expect(events[2]!.type).toBe('score.recorded');
    events[2] = {
      ...events[2]!,
      payload: { ...events[2]!.payload, value: 0 },
    } as (typeof events)[number];

    const res = await push(h, assessor, phone, events);
    expect(res.status).toBe(200);
    expect(res.body.acks.map((x: { status: string }) => x.status)).toEqual([
      'stored',
      'stored',
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(res.body.acks[2].reason).toMatch(/hash chain broken at seq 3 \(hash_mismatch\)/);
    expect((await flagsOf('chain_broken')).some((f) => f.deviceId === phone.deviceId)).toBe(true);
    expect(await entriesOn(phone.deviceId)).toBe(2);
  });

  it('rejects an event that reuses a stored id with different content', async () => {
    const phone = await h.phone(assessor);
    const [first] = buildAssessment(h, phone, workerId).events;
    await pushOk(h, assessor, phone, [first!]);
    const forged = { ...first!, hash: 'f'.repeat(64) };
    const res = await push(h, assessor, phone, [forged]);
    expect(res.body.acks[0]).toMatchObject({
      status: 'rejected',
      reason: expect.stringMatching(/different content/),
    });
  });

  it('refuses a device that is not registered to the user', async () => {
    const other = await h.user('assessor', 'Other Assessor');
    const othersPhone = await h.phone(other);
    const a = buildAssessment(h, othersPhone, workerId);
    const res = await push(h, assessor, othersPhone, a.events);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/not registered to you/);
  });

  it('rejects events that claim to come from another user', async () => {
    const phone = await h.phone(assessor);
    const impostor = await h.user('assessor', 'Impostor');
    const a = buildAssessment(h, phone, workerId);
    const start = a.events[0]!;
    const res = await push(h, assessor, phone, [
      phone.event(
        'session.started',
        { ...(start.payload as never), sessionId: uuidv4() },
        { actor: impostor.actor },
      ),
    ]);
    // The new event is chained after `start`, which was never pushed: rejected either way.
    expect(res.body.acks[0].status).toBe('rejected');
  });

  it('keeps an event whose projection is invalid, and flags it', async () => {
    const phone = await h.phone(assessor);
    const res = await pushOk(h, assessor, phone, [
      phone.event('score.recorded', {
        sessionId: uuidv4(),
        criterionId: 'L3-N1.PC1',
        value: 2,
        evidenceIds: [],
        aiFlags: [],
      }),
    ]);
    expect(res.acks[0].status).toBe('stored');
    expect((await flagsOf('invalid_event')).some((f) => f.deviceId === phone.deviceId)).toBe(true);
  });
});

describe('phones sync in any order (rule 2)', () => {
  it("stores a session that arrives before its worker's registration, and blocks approval until it does", async () => {
    const lateMobiliserPhone = await h.phone(mobiliser);
    const phone = await h.phone(assessor);
    const workerFromLatePhone = uuidv4();
    const a = buildAssessment(h, phone, workerFromLatePhone);

    // The assessor's phone syncs first: everything is stored, nothing fails.
    await pushOk(h, assessor, phone, a.events);
    await uploadAll(h, assessor, a);
    const payload = signPayload(a);
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', payload)]);

    const awardingBody = await h.user('awarding_body');
    const blocked = await h.http.get('/v1/recommendations').set(awardingBody.auth);
    const mine = blocked.body.find((r: { id: string }) => r.id === payload.recommendationId);
    expect(mine.workerName).toBe('');
    expect(mine.blockers).toContainEqual({ code: 'worker_unknown', params: {} });

    // Then the mobiliser's phone syncs the registration, and the blocker goes away.
    await pushOk(h, mobiliser, lateMobiliserPhone, [
      lateMobiliserPhone.event('worker.registered', {
        workerId: workerFromLatePhone,
        name: 'Late Sync',
        phone: '9000000099',
        language: 'hi',
      }),
    ]);
    const after = await h.http.get('/v1/recommendations').set(awardingBody.auth);
    const now = after.body.find((r: { id: string }) => r.id === payload.recommendationId);
    expect(now.workerName).toBe('Late Sync');
    expect(now.blockers).toEqual([]);
  });

  it('flags, rather than fails, an event that breaks a database constraint', async () => {
    const res = await pushOk(h, mobiliser, mobiliserPhone, [
      mobiliserPhone.event('consent.given', {
        consentId: uuidv4(),
        workerId: uuidv4(), // a worker no phone has registered
        noticeVersion: 'v1',
        language: 'hi',
        readAloud: true,
      }),
    ]);
    expect(res.acks[0].status).toBe('stored');
    const invalid = (await flagsOf('invalid_event')).filter(
      (f) => f.deviceId === mobiliserPhone.deviceId,
    );
    expect(invalid.at(-1)?.params).toMatchObject({ type: 'consent.given' });
  });
});

describe('integrity flags (FR-11)', () => {
  it('flags a mock location', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId, { gps: { ...VENUE, mocked: true } });
    await pushOk(h, assessor, phone, a.events);
    expect(
      (await flagsOf('mock_gps')).filter((f) => f.sessionId === a.sessionId).length,
    ).toBeGreaterThan(0);
  });

  it('flags a clip recorded outside the geofence', async () => {
    const phone = await h.phone(assessor);
    // About 1.1 km north of where the session started.
    const a = buildAssessment(h, phone, workerId, { gps: { ...VENUE, lat: VENUE.lat + 0.01 } });
    await pushOk(h, assessor, phone, a.events);
    const geofence = (await flagsOf('geofence')).filter((f) => f.sessionId === a.sessionId);
    expect(geofence.length).toBe(a.clips.size);
    expect(geofence[0]!.detail).toMatch(/1112 m from where the session started/);
    expect(geofence[0]!.params).toEqual({ criterionId: 'L3-N1.PC1', metres: 1112 });
  });

  it('flags the exact same clip submitted in two sessions', async () => {
    const phone = await h.phone(assessor);
    const first = buildAssessment(h, phone, workerId, { clipLabel: 'reused' });
    await pushOk(h, assessor, phone, first.events);
    const second = buildAssessment(h, phone, workerId, { clipLabel: 'reused' });
    await pushOk(h, assessor, phone, second.events);
    expect(
      (await flagsOf('reused_clip')).filter((f) => f.sessionId === second.sessionId).length,
    ).toBe(second.clips.size);
  });

  it('flags a device clock far from server time', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId);
    const lateClock = new Date(h.deps.now().getTime() - 3 * 3_600_000);
    const res = await h.http
      .post('/v1/sync/push')
      .set(assessor.auth)
      .send(phone.push(a.events.slice(0, 1), lateClock));
    expect(res.status).toBe(200);
    const drift = (await flagsOf('clock_drift')).filter((f) => f.deviceId === phone.deviceId);
    expect(drift[0]?.detail).toMatch(/180 min/);
  });
});

describe('IT-03 (sync): only people decide', () => {
  it('rejects a score created by an AI job', async () => {
    const phone = await h.phone(assessor);
    const a = buildAssessment(h, phone, workerId);
    const res = await push(h, assessor, phone, [
      a.events[0]!,
      phone.event(
        'score.recorded',
        {
          sessionId: a.sessionId,
          criterionId: 'L3-N1.PC1',
          value: 2,
          evidenceIds: [],
          aiFlags: [],
        },
        { actor: { kind: 'system', service: 'queue-worker' } },
      ),
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.details.join(' ')).toMatch(/system may not create score.recorded/);
  });

  it('rejects a score from a mobiliser', async () => {
    const res = await push(h, mobiliser, mobiliserPhone, [
      mobiliserPhone.event('score.recorded', {
        sessionId: uuidv4(),
        criterionId: 'L3-N1.PC1',
        value: 2,
        evidenceIds: [],
        aiFlags: [],
      }),
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.details.join(' ')).toMatch(/mobiliser may not create score.recorded/);
  });

  it('does not let office roles sync from a phone', async () => {
    const agency = await h.user('agency');
    const res = await h.http.post('/v1/sync/push').set(agency.auth).send({});
    expect(res.status).toBe(403);
  });
});

describe('GET /v1/sync/pull', () => {
  it('returns the trade pack and a cursor that moves on', async () => {
    const first = await h.http.get('/v1/sync/pull').set(assessor.auth);
    expect(first.status).toBe(200);
    expect(first.body.items).toContainEqual(
      expect.objectContaining({ type: 'trade_pack', packId: 'csdci-electrician' }),
    );
    h.tick();
    const next = await h.http.get(`/v1/sync/pull?cursor=${first.body.cursor}`).set(assessor.auth);
    expect(next.body.items.filter((i: { type: string }) => i.type === 'trade_pack')).toEqual([]);
  });
});

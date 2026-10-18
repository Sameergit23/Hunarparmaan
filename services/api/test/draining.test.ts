/**
 * IT-09: deactivated accounts and retired phones drain; a lost phone is
 * refused (ADR 010 point 8, TRD section 6.3). The statuses are set directly
 * here; the admin actions that set them are tested in IT-08.
 */
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeviceStatus } from '@hunarpramaan/contracts';
import { devices, flags, organisations, users } from '../src/db/schema';
import type { SimulatedPhone } from '../src/dev/simulated-phone';
import { DRAIN_MS, accountStatus } from '../src/domain/accounts';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';
import {
  buildAssessment,
  push,
  pushOk,
  registerWorker,
  signPayload,
  ticketFor,
  uploadAll,
} from '../src/test/scenario';

let h: Harness;
let admin: TestUser;
let awardingBody: TestUser;
let agency: TestUser;
let workerId: string;

beforeAll(async () => {
  h = await startHarness();
  admin = await h.user('agency_admin');
  awardingBody = await h.user('awarding_body');
  agency = await h.user('agency');
  const mobiliser = await h.user('mobiliser');
  workerId = await registerWorker(h, mobiliser, await h.phone(mobiliser));
});
afterAll(() => h.close());

const deactivate = (user: TestUser) =>
  h.db
    .update(users)
    .set({ status: 'draining', statusChangedAt: h.deps.now(), statusChangedBy: admin.id })
    .where(eq(users.id, user.id));

const setPhone = (phone: SimulatedPhone, status: DeviceStatus) =>
  h.db
    .update(devices)
    .set({ status, statusChangedAt: h.deps.now(), revokedAt: h.deps.now() })
    .where(eq(devices.id, phone.deviceId));

const drainedFlags = (deviceId: string) =>
  h.db
    .select()
    .from(flags)
    .where(and(eq(flags.kind, 'drained_work'), eq(flags.deviceId, deviceId)));

const approve = (recommendationId: string) =>
  h.http
    .post(`/v1/recommendations/${recommendationId}/approve`)
    .set(awardingBody.auth)
    .send({ decision: 'approved' });

async function assessorWithPhone() {
  const assessor = await h.user('assessor');
  return { assessor, phone: await h.phone(assessor) };
}

describe('IT-09: a deactivated account drains', () => {
  it('stores work recorded before the cut-off, flags each event, and still lets it be approved', async () => {
    const { assessor, phone } = await assessorWithPhone();
    const a = buildAssessment(h, phone, workerId);
    const payload = signPayload(a);
    const signed = phone.event('recommendation.signed', payload);
    h.tick();
    await deactivate(assessor);
    h.tick();

    // The phone's token still works for sync, and nothing else.
    await pushOk(h, assessor, phone, [...a.events, signed]);
    const raised = await drainedFlags(phone.deviceId);
    expect(raised).toHaveLength(a.events.length + 1);
    expect(raised.every((f) => f.params.by === 'account' && f.params.when === undefined)).toBe(
      true,
    );
    await uploadAll(h, assessor, a);

    const detail = await h.http.get(`/v1/sessions/${a.sessionId}`).set(agency.auth);
    expect(detail.body.recommendation.blockers).toEqual([]);
    expect((await approve(payload.recommendationId)).status).toBe(201);
  });

  it('stores and flags a session started after the cut-off, and blocks its approval', async () => {
    const { assessor, phone } = await assessorWithPhone();
    await deactivate(assessor);
    h.tick();
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);
    const [started] = (await drainedFlags(phone.deviceId)).filter(
      (f) => f.params.type === 'session.started',
    );
    expect(started).toMatchObject({ sessionId: a.sessionId, params: { when: 'after' } });

    await uploadAll(h, assessor, a);
    const payload = signPayload(a);
    await pushOk(h, assessor, phone, [phone.event('recommendation.signed', payload)]);
    const detail = await h.http.get(`/v1/sessions/${a.sessionId}`).set(agency.auth);
    expect(detail.body.recommendation.blockers).toEqual([
      { code: 'started_after_deactivation', params: { by: 'account' } },
    ]);
    const res = await approve(payload.recommendationId);
    expect(res.status).toBe(409);
  });

  it("refuses the account's other requests and its sign-in at once", async () => {
    const { assessor, phone } = await assessorWithPhone();
    await deactivate(assessor);

    const pull = await h.http.get('/v1/sync/pull').set(assessor.auth);
    expect(pull.status).toBe(200);
    for (const res of [
      await h.http.get('/v1/trade-packs/csdci-electrician').set(assessor.auth),
      await h.http
        .post('/v1/auth/renewal-key')
        .set(assessor.auth)
        .send({ deviceId: phone.deviceId }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('account_deactivated');
    }

    const { ticket } = await ticketFor(h, assessor.phone);
    const wrong = await h.http.post('/v1/auth/login').send({ ticket, pin: '0000' });
    expect(wrong.body.error.message).toBe('Wrong PIN');
    const right = await h.http.post('/v1/auth/login').send({ ticket, pin: PIN });
    expect(right.status).toBe(401);
    expect(right.body.error.code).toBe('account_deactivated');
  });

  it('ends a web sign-in at once: an account with no phones has nothing to drain', async () => {
    const desk = await h.user('agency');
    expect((await h.http.get('/v1/sessions').set(desk.auth)).status).toBe(200);
    await deactivate(desk);
    const res = await h.http.get('/v1/sessions').set(desk.auth);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('account_deactivated');
  });

  it('keeps renewing its phone while it drains, and closes 30 days after the last sync', async () => {
    const { assessor, phone } = await assessorWithPhone();
    const issued = await h.http
      .post('/v1/auth/renewal-key')
      .set(assessor.auth)
      .send({ deviceId: phone.deviceId });
    let renewalKey: string = issued.body.renewalKey;
    const a = buildAssessment(h, phone, workerId);
    await deactivate(assessor);

    // Days later, the phone renews its sign-in (12 hours) with its key, and syncs.
    const renewAndPush = async (index: number) => {
      const res = await h.http
        .post('/v1/auth/refresh')
        .send({ deviceId: phone.deviceId, renewalKey });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      renewalKey = res.body.renewal.renewalKey;
      const auth = { ...assessor, auth: { Authorization: `Bearer ${res.body.token}` } };
      await pushOk(h, auth, phone, a.events.slice(index, index + 1));
    };
    // Just inside 30 days of the key and the deactivation (building the assessment took minutes).
    h.tick(DRAIN_MS - 10 * 60_000);
    await renewAndPush(0);
    // Each sync starts the 30 days again.
    h.tick(DRAIN_MS - 10 * 60_000);
    await renewAndPush(1);

    h.tick(DRAIN_MS + 60_000);
    const closed = await h.http
      .post('/v1/auth/refresh')
      .send({ deviceId: phone.deviceId, renewalKey });
    expect(closed.status).toBe(401);
  });

  it('reads a draining account as closed with no phone whose work can still arrive', () => {
    const now = new Date('2026-11-24T05:00:00.000Z');
    const draining = { status: 'draining' as const, statusChangedAt: now };
    const synced = { status: 'registered' as const, lastSyncAt: now };
    expect(accountStatus(draining, [synced], now)).toBe('draining');
    expect(accountStatus(draining, [], now)).toBe('closed');
    expect(accountStatus(draining, [{ ...synced, status: 'lost' }], now)).toBe('closed');
    const later = new Date(now.getTime() + DRAIN_MS);
    expect(accountStatus(draining, [synced], later)).toBe('closed');
    expect(accountStatus({ status: 'active', statusChangedAt: null }, [], later)).toBe('active');
  });

  it("lets a closed account's number be invited again, as a new account", async () => {
    // A fresh admin: the 30-day test above outlived the first one's sign-in.
    const admin = await h.user('agency_admin');
    const desk = await h.user('agency');
    await deactivate(desk);
    const res = await h.http
      .post('/v1/admin/invites')
      .set(admin.auth)
      .send({ phone: desk.phone, name: 'New Desk', role: 'agency', reason: 'new_staff', pin: PIN });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [old] = await h.db.select().from(users).where(eq(users.id, desk.id));
    expect(old?.status).toBe('closed');

    const { ticket, account } = await ticketFor(h, desk.phone);
    expect(account).toBe('invited');
    const accepted = await h.http
      .post('/v1/auth/invite/accept')
      .send({ ticket, inviteCode: res.body.code, pin: '305718' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.user.id).not.toBe(desk.id);
  });
});

describe('IT-09: retired and lost phones', () => {
  it('stores what a retired phone sends, flagged as drained by the phone', async () => {
    const { assessor, phone } = await assessorWithPhone();
    const a = buildAssessment(h, phone, workerId);
    h.tick();
    await setPhone(phone, 'retired');
    await pushOk(h, assessor, phone, a.events);
    const raised = await drainedFlags(phone.deviceId);
    expect(raised).toHaveLength(a.events.length);
    expect(raised.every((f) => f.params.by === 'phone')).toBe(true);

    // No new renewal key on a retired phone; the account itself is still active.
    const key = await h.http
      .post('/v1/auth/renewal-key')
      .set(assessor.auth)
      .send({ deviceId: phone.deviceId });
    expect(key.status).toBe(403);
  });

  it('refuses every push from a lost phone, whatever its times, and its renewal keys', async () => {
    const { assessor, phone } = await assessorWithPhone();
    const key = await h.http
      .post('/v1/auth/renewal-key')
      .set(assessor.auth)
      .send({ deviceId: phone.deviceId });
    expect(key.status).toBe(201);
    const recordedBefore = buildAssessment(h, phone, workerId);
    h.tick();
    await setPhone(phone, 'lost');

    const res = await push(h, assessor, phone, recordedBefore.events);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('device_lost');
    const refresh = await h.http
      .post('/v1/auth/refresh')
      .send({ deviceId: phone.deviceId, renewalKey: key.body.renewalKey });
    expect(refresh.status).toBe(401);
    const rebind = await h.http
      .post('/v1/devices')
      .set(assessor.auth)
      .send({ deviceId: phone.deviceId });
    expect(rebind.status).toBe(403);
    expect(rebind.body.error.code).toBe('device_lost');
  });

  it("records each accepted push as the phone's last sync", async () => {
    const { assessor, phone } = await assessorWithPhone();
    const a = buildAssessment(h, phone, workerId);
    const at = h.tick();
    await pushOk(h, assessor, phone, a.events.slice(0, 1));
    const [row] = await h.db.select().from(devices).where(eq(devices.id, phone.deviceId));
    expect(row?.lastSyncAt?.toISOString()).toBe(at.toISOString());
  });
});

describe('every request checks the organisation', () => {
  it("refuses a suspended organisation's accounts, at sign-in too", async () => {
    const agencyId = await h.organisation('assessment_agency');
    const desk = await h.user('agency', 'Desk', { organisationId: agencyId });
    await h.db
      .update(organisations)
      .set({ status: 'suspended' })
      .where(eq(organisations.id, agencyId));
    const res = await h.http.get('/v1/sessions').set(desk.auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('organisation_suspended');

    const { ticket } = await ticketFor(h, desk.phone);
    const login = await h.http.post('/v1/auth/login').send({ ticket, pin: PIN });
    expect(login.body.error.code).toBe('organisation_suspended');
  });
});

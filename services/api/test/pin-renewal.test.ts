import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { devices, users } from '../src/db/schema';
import { RENEWAL_TTL_MS } from '../src/domain/auth';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';
import { signUpWorker, ticketFor } from '../src/test/scenario';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const changePin = (user: TestUser, currentPin: string, newPin: string) =>
  h.http.post('/v1/auth/pin').set(user.auth).send({ currentPin, newPin });

describe('changing the PIN', () => {
  it('sets a new PIN, ends every older sign-in and returns a fresh one', async () => {
    const assessor = await h.user('assessor');
    const res = await changePin(assessor, PIN, '305718');
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const old = await h.http.get('/v1/sync/pull').set(assessor.auth);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('token_revoked');
    expect((await h.http.get('/v1/sync/pull').set(bearer(res.body.token))).status).toBe(200);

    const { ticket } = await ticketFor(h, assessor.phone);
    const signIn = await h.http.post('/v1/auth/login').send({ ticket, pin: '305718' });
    expect(signIn.status).toBe(200);
  });

  it('refuses a wrong current PIN with 403, not a sign-out, and counts it', async () => {
    const assessor = await h.user('assessor');
    const res = await changePin(assessor, '0000', '305718');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('wrong_pin');
    const [account] = await h.db.select().from(users).where(eq(users.id, assessor.id));
    expect(account?.failedPinAttempts).toBe(1);
  });

  it('applies the PIN rules for the role: 6 digits for staff, nothing easy', async () => {
    const assessor = await h.user('assessor');
    const short = await changePin(assessor, PIN, '9173');
    expect(short.body.error).toMatchObject({ code: 'pin_rejected', details: ['length'] });
    const easy = await changePin(assessor, PIN, '123456');
    expect(easy.body.error).toMatchObject({ code: 'pin_rejected', details: ['easy'] });
  });
});

describe('resetting a forgotten PIN', () => {
  it('lets a worker set a new PIN with a fresh code, ending older sign-ins', async () => {
    const { worker } = await signUpWorker(h);
    const { ticket } = await ticketFor(h, worker.phone, 16 * 60_000);
    const res = await h.http.post('/v1/auth/pin/reset').send({ ticket, newPin: '2580' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await h.http.get('/v1/sync/pull').set(worker.auth)).status).toBe(401);
    expect((await h.http.get('/v1/sync/pull').set(bearer(res.body.token))).status).toBe(200);
  });

  it('sends staff to their admin', async () => {
    const assessor = await h.user('assessor');
    const { ticket } = await ticketFor(h, assessor.phone);
    const res = await h.http.post('/v1/auth/pin/reset').send({ ticket, newPin: '305718' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('pin_reset_by_admin');
  });
});

describe('IT-07: staying signed in on a phone', () => {
  async function phoneWithKey(user: TestUser) {
    const phone = await h.phone(user);
    const res = await h.http
      .post('/v1/auth/renewal-key')
      .set(user.auth)
      .send({ deviceId: phone.deviceId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { deviceId: phone.deviceId, renewalKey: res.body.renewalKey as string };
  }
  const refresh = (deviceId: string, renewalKey: string) =>
    h.http.post('/v1/auth/refresh').send({ deviceId, renewalKey });

  it('renews the sign-in and replaces the key each time', async () => {
    const assessor = await h.user('assessor');
    const { deviceId, renewalKey } = await phoneWithKey(assessor);
    h.tick(13 * 3_600_000);
    expect((await h.http.get('/v1/sync/pull').set(assessor.auth)).status).toBe(401);

    const res = await refresh(deviceId, renewalKey);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.renewal.renewalKey).not.toBe(renewalKey);
    expect((await h.http.get('/v1/sync/pull').set(bearer(res.body.token))).status).toBe(200);
    expect((await refresh(deviceId, res.body.renewal.renewalKey)).status).toBe(200);
  });

  it('ends every key on the phone when a replaced key is used again', async () => {
    const assessor = await h.user('assessor');
    const { deviceId, renewalKey } = await phoneWithKey(assessor);
    const first = await refresh(deviceId, renewalKey);
    const stolen = await refresh(deviceId, renewalKey);
    expect(stolen.status).toBe(401);
    expect(stolen.body.error.code).toBe('token_revoked');
    expect((await refresh(deviceId, first.body.renewal.renewalKey)).status).toBe(401);
  });

  it('ends a key after 30 days without use', async () => {
    const assessor = await h.user('assessor');
    const { deviceId, renewalKey } = await phoneWithKey(assessor);
    h.tick(RENEWAL_TTL_MS + 1_000);
    expect((await refresh(deviceId, renewalKey)).status).toBe(401);
  });

  it('ends keys when the PIN changes or the phone is revoked', async () => {
    const assessor = await h.user('assessor');
    const one = await phoneWithKey(assessor);
    const two = await phoneWithKey(assessor);
    await h.db.update(devices).set({ revokedAt: h.deps.now() }).where(eq(devices.id, two.deviceId));
    expect((await refresh(two.deviceId, two.renewalKey)).status).toBe(401);

    expect((await changePin(assessor, PIN, '305718')).status).toBe(200);
    expect((await refresh(one.deviceId, one.renewalKey)).status).toBe(401);
  });

  it('gives keys only for your own phone, and only to roles that use a phone', async () => {
    const assessor = await h.user('assessor');
    const other = await h.user('assessor');
    const othersPhone = await h.phone(other);
    const res = await h.http
      .post('/v1/auth/renewal-key')
      .set(assessor.auth)
      .send({ deviceId: othersPhone.deviceId });
    expect(res.status).toBe(403);

    const agency = await h.user('agency');
    const office = await h.http
      .post('/v1/auth/renewal-key')
      .set(agency.auth)
      .send({ deviceId: othersPhone.deviceId });
    expect(office.status).toBe(403);
  });

  it('works for a worker who signed up on their own phone', async () => {
    const { worker } = await signUpWorker(h);
    const bind = await h.http
      .post('/v1/devices')
      .set(worker.auth)
      .send({ deviceId: 'own-phone-9' });
    expect(bind.status).toBe(201);
    const key = await h.http
      .post('/v1/auth/renewal-key')
      .set(worker.auth)
      .send({ deviceId: 'own-phone-9' });
    expect(key.status).toBe(201);
    expect((await refresh('own-phone-9', key.body.renewalKey)).status).toBe(200);
  });
});

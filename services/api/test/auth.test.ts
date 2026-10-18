import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { PILOT_ORGANISATIONS } from '../src/domain/organisations';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';

let h: Harness;
let assessor: TestUser;

beforeAll(async () => {
  h = await startHarness();
  assessor = await h.user('assessor', 'Anil Sharma');
});
afterAll(() => h.close());

async function challenge(phone: string) {
  // Past the per-number limits (3 codes in 15 minutes), so these tests can reuse one number.
  h.tick(16 * 60_000);
  const res = await h.http.post('/v1/auth/otp').send({ phone });
  expect(res.status).toBe(201);
  return res.body as { challengeId: string; mockCode: string };
}

describe('OTP + PIN login (FR-05)', () => {
  it('logs in with the mock OTP and the PIN, and the token works', async () => {
    const { challengeId, mockCode } = await challenge(`+91${assessor.phone}`);
    expect(mockCode).toBe('123456');
    const res = await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin: PIN });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: assessor.id,
      name: 'Anil Sharma',
      role: 'assessor',
      organisationId: PILOT_ORGANISATIONS.assessment_agency.id,
    });

    const pull = await h.http.get('/v1/sync/pull').set('Authorization', `Bearer ${res.body.token}`);
    expect(pull.status).toBe(200);
  });

  it('refuses a wrong PIN without saying which part was wrong', async () => {
    const { challengeId, mockCode } = await challenge(assessor.phone);
    const res = await h.http
      .post('/v1/auth/login')
      .send({ challengeId, otp: mockCode, pin: '0000' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Wrong code or PIN');
  });

  it('does not reveal whether a number is registered', async () => {
    const { challengeId, mockCode } = await challenge('9999999999');
    const res = await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin: PIN });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Wrong code or PIN');
  });

  it('uses each code once', async () => {
    const { challengeId, mockCode } = await challenge(assessor.phone);
    expect(
      (await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin: PIN })).status,
    ).toBe(200);
    expect(
      (await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin: PIN })).status,
    ).toBe(401);
  });

  it('locks a code after 5 wrong tries', async () => {
    const { challengeId, mockCode } = await challenge(assessor.phone);
    for (let i = 0; i < 5; i += 1) {
      await h.http.post('/v1/auth/login').send({ challengeId, otp: '000000', pin: PIN });
    }
    const res = await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin: PIN });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/);
  });

  it('expires a code after 5 minutes', async () => {
    const { challengeId, mockCode } = await challenge(assessor.phone);
    h.tick(6 * 60_000);
    const res = await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin: PIN });
    expect(res.status).toBe(401);
  });

  it('rejects a token without an organisation, such as one issued before ADR 010', async () => {
    const issuedAt = Math.floor(h.deps.now().getTime() / 1000);
    const token = await new SignJWT({ role: 'assessor', name: 'Anil Sharma' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(assessor.id)
      .setIssuer('hunarpramaan-api')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3_600)
      .sign(new TextEncoder().encode(h.deps.config.JWT_SECRET));
    const res = await h.http.get('/v1/sync/pull').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    h.tick(13 * 3_600_000);
    const res = await h.http.get('/v1/sync/pull').set(assessor.auth);
    expect(res.status).toBe(401);
  });
});

describe('device binding', () => {
  it('binds a device to the first account that registers it', async () => {
    const fresh = await h.user('assessor', 'Fresh Assessor');
    const other = await h.user('assessor', 'Other Assessor');
    const first = await h.http
      .post('/v1/devices')
      .set(fresh.auth)
      .send({ deviceId: 'phone-abc-123' });
    expect(first.status).toBe(201);
    const again = await h.http
      .post('/v1/devices')
      .set(fresh.auth)
      .send({ deviceId: 'phone-abc-123' });
    expect(again.status).toBe(200);
    const stolen = await h.http
      .post('/v1/devices')
      .set(other.auth)
      .send({ deviceId: 'phone-abc-123' });
    expect(stolen.status).toBe(409);
  });

  it('does not let office roles register a field device', async () => {
    const agency = await h.user('agency');
    const res = await h.http.post('/v1/devices').set(agency.auth).send({ deviceId: 'office-pc-1' });
    expect(res.status).toBe(403);
  });
});

describe('trade packs', () => {
  it('serves the pack as canonical JSON with its hash', async () => {
    const fresh = await h.user('assessor');
    const res = await h.http.get('/v1/trade-packs/csdci-electrician').set(fresh.auth);
    expect(res.status).toBe(200);
    expect(res.headers['x-pack-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(res.text).pack.id).toBe('csdci-electrician');
  });
});

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { declarations, users, workers } from '../src/db/schema';
import { SimulatedPhone } from '../src/dev/simulated-phone';
import { PILOT_ORGANISATION_ID } from '../src/domain/organisations';
import { startHarness, type Harness } from '../src/test/harness';
import { newPhone, pushOk, registerWorker, signUpWorker, ticketFor } from '../src/test/scenario';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const register = (body: object) => h.http.post('/v1/auth/register').send(body);
const signUp = { pin: '9173', name: 'Kavita Joshi', language: 'hi' };

describe('workers sign up on their own phone (ADR 012)', () => {
  it('creates a worker account from a ticket, a PIN, a name and a language', async () => {
    const phone = newPhone();
    const { ticket, account } = await ticketFor(h, phone);
    expect(account).toBe('none');
    const res = await register({ ticket, ...signUp });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Kavita Joshi',
      role: 'worker',
      organisationId: PILOT_ORGANISATION_ID,
    });
    expect(res.body).toMatchObject({ claimed: false, previousSignInAt: null });
    expect(res.body.workerId).toMatch(/^[0-9a-f-]{36}$/);

    const pull = await h.http.get('/v1/sync/pull').set('Authorization', `Bearer ${res.body.token}`);
    expect(pull.status).toBe(200);
    expect((await ticketFor(h, phone, 16 * 60_000)).account).toBe('existing');
  });

  it.each([
    ['easy', '1234'],
    ['easy', '7777'],
    ['length', '91735'],
  ])('refuses a PIN that is %s (%s)', async (problem, pin) => {
    const { ticket } = await ticketFor(h, newPhone());
    const res = await register({ ticket, ...signUp, pin });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'pin_rejected', details: [problem] });
  });

  it('refuses a number that already has an account', async () => {
    const assessor = await h.user('assessor');
    const { ticket } = await ticketFor(h, assessor.phone);
    const res = await register({ ticket, ...signUp });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('phone_in_use');
  });

  it('uses each ticket for one account only', async () => {
    const { ticket } = await ticketFor(h, newPhone());
    expect((await register({ ticket, ...signUp })).status).toBe(201);
    expect((await register({ ticket, ...signUp })).status).toBe(401);
  });
});

describe('claiming the record a mobiliser made', () => {
  it('links the account to the worker the mobiliser registered with this number', async () => {
    const mobiliser = await h.user('mobiliser', 'Sunita Verma');
    const phone = newPhone();
    const recordId = await registerWorker(
      h,
      mobiliser,
      await h.phone(mobiliser),
      'Imran Khan',
      `+91${phone}`,
    );
    const { workerId, claimed, worker } = await signUpWorker(h, phone, { name: 'Imran Khan' });
    expect({ workerId, claimed }).toEqual({ workerId: recordId, claimed: true });
    const [account] = await h.db.select().from(users).where(eq(users.id, worker.id));
    expect(account?.workerId).toBe(recordId);
  });
});

describe("a signed-up worker's phone", () => {
  it('binds to the account and syncs the worker, consent and declaration', async () => {
    const phone = newPhone();
    const { worker, workerId } = await signUpWorker(h, phone);
    const deviceId = 'worker-own-phone-1';
    const bind = await h.http.post('/v1/devices').set(worker.auth).send({ deviceId });
    expect(bind.status).toBe(201);

    const device = new SimulatedPhone(deviceId, worker.actor, () => h.deps.now());
    const declarationId = uuidv4();
    await pushOk(h, worker, device, [
      device.event('worker.registered', { workerId, name: 'Kavita Joshi', phone, language: 'hi' }),
      device.event('consent.given', {
        consentId: uuidv4(),
        workerId,
        noticeVersion: 'v1',
        language: 'hi',
        readAloud: true,
      }),
      device.event('declaration.recorded', {
        declarationId,
        workerId,
        language: 'hi',
        source: 'vosk',
        asrTranscript: 'das saal se wiring karti hoon',
        transcript: '10 saal se wiring karti hoon',
      }),
    ]);

    const [record] = await h.db.select().from(workers).where(eq(workers.id, workerId));
    expect(record?.registeredBy).toBe(worker.id);
    const [declaration] = await h.db
      .select()
      .from(declarations)
      .where(eq(declarations.id, declarationId));
    expect(declaration?.workerId).toBe(workerId);
  });

  it('still cannot decide its own route', async () => {
    const { worker } = await signUpWorker(h);
    const deviceId = 'worker-own-phone-2';
    await h.http.post('/v1/devices').set(worker.auth).send({ deviceId });
    const device = new SimulatedPhone(deviceId, worker.actor, () => h.deps.now());
    const res = await h.http
      .post('/v1/sync/push')
      .set(worker.auth)
      .send(
        device.push([
          device.event('route.decided', {
            declarationId: uuidv4(),
            nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
            route: 'direct_assessment',
            suggested: { nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI', route: 'direct_assessment' },
          }),
        ]),
      );
    expect(res.status).toBe(400);
  });
});

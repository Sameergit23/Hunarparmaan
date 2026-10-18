import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authEvents, users } from '../src/db/schema';
import { CODES_PER_IP, TICKET_TTL_MS } from '../src/domain/auth';
import { PIN, startHarness, type Harness } from '../src/test/harness';
import { askForCode, newPhone, ticketFor } from '../src/test/scenario';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const loginWithTicket = (ticket: string, pin: string) =>
  h.http.post('/v1/auth/login').send({ ticket, pin });

describe('one way in: the code first, then the PIN (ADR 012)', () => {
  it('says whether a number has an account only once its code is right', async () => {
    const assessor = await h.user('assessor');
    const { challengeId } = await askForCode(h, assessor.phone);
    const wrong = await h.http.post('/v1/auth/otp/verify').send({ challengeId, otp: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).not.toHaveProperty('account');

    expect((await ticketFor(h, assessor.phone)).account).toBe('existing');
    expect((await ticketFor(h, newPhone())).account).toBe('none');
  });

  it('signs in with the ticket and the PIN, and tells the time of the sign-in before', async () => {
    const assessor = await h.user('assessor');
    const first = await loginWithTicket((await ticketFor(h, assessor.phone)).ticket, PIN);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.previousSignInAt).toBeNull();
    const firstAt = h.deps.now().toISOString();

    const second = await loginWithTicket((await ticketFor(h, assessor.phone)).ticket, PIN);
    expect(second.body.previousSignInAt).toBe(firstAt);
    const pull = await h.http
      .get('/v1/sync/pull')
      .set('Authorization', `Bearer ${second.body.token}`);
    expect(pull.status).toBe(200);
  });

  it('keeps the ticket for another try after a wrong PIN, and spends it on success', async () => {
    const assessor = await h.user('assessor');
    const { ticket } = await ticketFor(h, assessor.phone);
    const wrong = await loginWithTicket(ticket, '0000');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Wrong PIN');
    expect((await loginWithTicket(ticket, PIN)).status).toBe(200);
    expect((await loginWithTicket(ticket, PIN)).status).toBe(401);
  });

  it('says a number has no account, which the code has already proved', async () => {
    const { ticket } = await ticketFor(h, newPhone());
    expect((await loginWithTicket(ticket, PIN)).status).toBe(404);
  });

  it('ends a ticket after 10 minutes', async () => {
    const assessor = await h.user('assessor');
    const { ticket } = await ticketFor(h, assessor.phone);
    h.tick(TICKET_TTL_MS + 1_000);
    const res = await loginWithTicket(ticket, PIN);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/);
  });
});

describe('IT-06: limits on codes', () => {
  it('waits 30 seconds between codes for one number', async () => {
    const phone = newPhone();
    await askForCode(h, phone);
    const again = await h.http.post('/v1/auth/otp').send({ phone });
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('rate_limited');
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
    await askForCode(h, phone);
  });

  it('allows 3 codes per number in 15 minutes and 10 in a day', async () => {
    const phone = newPhone();
    for (let i = 0; i < 3; i += 1) await askForCode(h, phone);
    h.tick(31_000);
    expect((await h.http.post('/v1/auth/otp').send({ phone })).status).toBe(429);

    // Spread out enough for the 15-minute limit, the day still allows only 10.
    h.tick(15 * 60_000);
    for (let i = 3; i < 10; i += 1) await askForCode(h, phone, 5.1 * 60_000);
    h.tick(5.1 * 60_000);
    const eleventh = await h.http.post('/v1/auth/otp').send({ phone });
    expect(eleventh.status).toBe(429);
    h.tick(24 * 60 * 60_000);
    await askForCode(h, phone);
  });

  it('limits codes from one IP address, whatever the numbers', async () => {
    h.tick(16 * 60_000);
    for (let i = 0; i < CODES_PER_IP.max; i += 1) {
      const res = await h.http.post('/v1/auth/otp').send({ phone: newPhone() });
      expect(res.status).toBe(201);
    }
    const res = await h.http.post('/v1/auth/otp').send({ phone: newPhone() });
    expect(res.status).toBe(429);
    h.tick(16 * 60_000);
  });
});

describe('lockout after wrong PINs', () => {
  const tryPins = async (ticket: string, pins: string[]) => {
    for (const pin of pins) await loginWithTicket(ticket, pin);
  };
  const fiveWrong = ['0000', '1111', '2222', '3333', '5555'];

  it('locks for 15 minutes after 5 wrong PINs, then doubles up to an hour', async () => {
    const assessor = await h.user('assessor');
    let { ticket } = await ticketFor(h, assessor.phone);
    await tryPins(ticket, fiveWrong);
    const locked = await loginWithTicket(ticket, PIN);
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('account_locked');
    expect(Number(locked.headers['retry-after'])).toBe(15 * 60);

    for (const minutes of [30, 60, 60]) {
      h.tick(61 * 60_000);
      ({ ticket } = await ticketFor(h, assessor.phone));
      await tryPins(ticket, fiveWrong);
      const res = await loginWithTicket(ticket, PIN);
      expect(res.body.error.code).toBe('account_locked');
      expect(Number(res.headers['retry-after'])).toBe(minutes * 60);
    }
  });

  it('counts wrong PINs on the web too, keeping one message for code or PIN', async () => {
    const agency = await h.user('agency');
    const { challengeId, mockCode } = await askForCode(h, agency.phone);
    for (const pin of fiveWrong) {
      const res = await h.http.post('/v1/auth/login').send({ challengeId, otp: mockCode, pin });
      expect(res.body.error.message).toBe('Wrong code or PIN');
    }
    const next = await askForCode(h, agency.phone);
    const res = await h.http
      .post('/v1/auth/login')
      .send({ challengeId: next.challengeId, otp: next.mockCode, pin: PIN });
    expect(res.body.error.code).toBe('account_locked');
  });

  it('clears the count after a good sign-in', async () => {
    const assessor = await h.user('assessor');
    const { ticket } = await ticketFor(h, assessor.phone);
    await tryPins(ticket, fiveWrong.slice(0, 4));
    expect((await loginWithTicket(ticket, PIN)).status).toBe(200);
    const again = await ticketFor(h, assessor.phone);
    await tryPins(again.ticket, fiveWrong.slice(0, 4));
    expect((await loginWithTicket(again.ticket, PIN)).status).toBe(200);
  });
});

describe('the sign-in log (ADR 010)', () => {
  it('records sign-ins, failures and lockouts, and never a phone number', async () => {
    const assessor = await h.user('assessor');
    const { ticket } = await ticketFor(h, assessor.phone);
    await loginWithTicket(ticket, '0000');
    await loginWithTicket(ticket, PIN);
    const rows = await h.db.select().from(authEvents).where(eq(authEvents.userId, assessor.id));
    expect(rows.map((r) => r.type).sort()).toEqual(['sign_in_failed', 'signed_in']);
    expect(JSON.stringify(rows)).not.toContain(assessor.phone);
    const [account] = await h.db.select().from(users).where(eq(users.id, assessor.id));
    expect(account?.failedPinAttempts).toBe(0);
  });
});

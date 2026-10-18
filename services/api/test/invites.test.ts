import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { Role } from '@hunarpramaan/contracts';
import { accountInvites, adminEvents } from '../src/db/schema';
import { INVITE_TTL_MS, verifyAdminLog } from '../src/domain/admin';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';
import { newPhone, ticketFor } from '../src/test/scenario';

let h: Harness;
let agencyAdmin: TestUser;

beforeAll(async () => {
  h = await startHarness();
  agencyAdmin = await h.user('agency_admin', 'Agency Admin');
});
afterAll(() => h.close());

const invite = (admin: TestUser, body: { phone: string; name: string; role: Role }) =>
  h.http
    .post('/v1/admin/invites')
    .set(admin.auth)
    .send({ reason: 'new_staff', pin: PIN, ...body });
const accept = (ticket: string, inviteCode: string, pin = '305718') =>
  h.http.post('/v1/auth/invite/accept').send({ ticket, inviteCode, pin });

describe('staff invites (ADR 010)', () => {
  it('an admin invites an assessor, who accepts with the SMS code, the invite code and a new PIN', async () => {
    const phone = newPhone();
    const res = await invite(agencyAdmin, { phone, name: 'Neha Gupta', role: 'assessor' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.code).toMatch(/^\d{8}$/);

    const { ticket, account } = await ticketFor(h, phone);
    expect(account).toBe('invited');
    const accepted = await accept(ticket, res.body.code);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    expect(accepted.body.user).toMatchObject({ name: 'Neha Gupta', role: 'assessor' });
    const pull = await h.http
      .get('/v1/sync/pull')
      .set('Authorization', `Bearer ${accepted.body.token}`);
    expect(pull.status).toBe(200);

    const again = await ticketFor(h, phone, 16 * 60_000);
    expect(again.account).toBe('existing');
    const signIn = await h.http
      .post('/v1/auth/login')
      .send({ ticket: again.ticket, pin: '305718' });
    expect(signIn.status).toBe(200);
  });

  it('lets each admin invite only the roles GRANTABLE_ROLES gives them', async () => {
    const tpAdmin = await h.user('tp_admin');
    const refused = await invite(tpAdmin, { phone: newPhone(), name: 'X Y', role: 'assessor' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('role_not_grantable');
    const allowed = await invite(tpAdmin, { phone: newPhone(), name: 'X Y', role: 'mobiliser' });
    expect(allowed.status).toBe(201);

    const agency = await h.user('agency');
    const notAdmin = await invite(agency, { phone: newPhone(), name: 'X Y', role: 'agency' });
    expect(notAdmin.status).toBe(403);
  });

  it('refuses a number that already has an account', async () => {
    const assessor = await h.user('assessor');
    const res = await invite(agencyAdmin, { phone: assessor.phone, name: 'X Y', role: 'agency' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('phone_in_use');
  });

  it('replaces an older invite for the same number with a newer one', async () => {
    const phone = newPhone();
    const first = await invite(agencyAdmin, { phone, name: 'Old Invite', role: 'agency' });
    const second = await invite(agencyAdmin, { phone, name: 'New Invite', role: 'agency' });
    const { ticket } = await ticketFor(h, phone);
    const old = await accept(ticket, first.body.code);
    expect(old.status).toBe(400);
    expect(old.body.error.code).toBe('invite_invalid');
    const res = await accept(ticket, second.body.code);
    expect(res.status).toBe(201);
    expect(res.body.user.name).toBe('New Invite');
  });

  it('checks the PIN rules for the role first, without using up a try', async () => {
    const phone = newPhone();
    const created = await invite(agencyAdmin, { phone, name: 'X Y', role: 'agency' });
    const { ticket } = await ticketFor(h, phone);
    const short = await accept(ticket, created.body.code, '9173');
    expect(short.body.error).toMatchObject({ code: 'pin_rejected', details: ['length'] });
    const [row] = await h.db
      .select()
      .from(accountInvites)
      .where(eq(accountInvites.id, created.body.inviteId));
    expect(row?.attempts).toBe(0);
  });

  it('allows 5 wrong codes, then the invite stops working', async () => {
    const phone = newPhone();
    const created = await invite(agencyAdmin, { phone, name: 'X Y', role: 'agency' });
    const { ticket } = await ticketFor(h, phone);
    for (let i = 0; i < 5; i += 1) {
      expect((await accept(ticket, '11111111')).status).toBe(400);
    }
    expect((await accept(ticket, created.body.code)).status).toBe(400);
  });

  it('ends an invite after 72 hours', async () => {
    const phone = newPhone();
    const created = await invite(agencyAdmin, { phone, name: 'X Y', role: 'agency' });
    h.tick(INVITE_TTL_MS + 1_000);
    const { ticket, account } = await ticketFor(h, phone);
    expect(account).toBe('none');
    expect((await accept(ticket, created.body.code)).status).toBe(400);
  });
});

describe('the admin log (ADR 010)', () => {
  it('chains every admin action and holds no name or phone number', async () => {
    const phone = newPhone();
    // A fresh admin: the 72-hour test above outlived the first admin's sign-in.
    const admin = await h.user('agency_admin');
    const res = await invite(admin, { phone, name: 'Log Check', role: 'agency' });
    expect(res.status).toBe(201);
    const rows = await h.db.select().from(adminEvents).orderBy(asc(adminEvents.seq));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.type === 'account.invited' && row.reason === 'new_staff')).toBe(
      true,
    );
    expect(JSON.stringify(rows)).not.toContain(phone);
    expect(JSON.stringify(rows)).not.toContain('Log Check');
    expect(await verifyAdminLog(h.db)).toMatchObject({ ok: true, count: rows.length });
  });
});

describe('IT-04 (API half): admins never decide', () => {
  const id = uuidv4();
  const decisions: [string, string][] = [
    ['score and sign', `/v1/sessions/${id}/sign`],
    ['approve', `/v1/recommendations/${id}/approve`],
    ['review a flag', `/v1/flags/${id}/review`],
    ['re-score', '/v1/rescoring'],
    ['decide a route', `/v1/declarations/${id}/override`],
    ['export to SIDH', '/v1/exports/sidh'],
    ['sync from a phone', '/v1/sync/push'],
  ];

  it.each(['platform_admin', 'tp_admin', 'agency_admin', 'ab_admin'] as const)(
    '%s gets 403 for every decision',
    async (role) => {
      const admin = await h.user(role);
      for (const [what, path] of decisions) {
        const res = await h.http.post(path).set(admin.auth).send({});
        expect(res.status, `${role} may not ${what}`).toBe(403);
      }
    },
  );
});

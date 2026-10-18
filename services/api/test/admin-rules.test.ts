/**
 * IT-08: the admin rules (FR-22 to FR-31, TRD section 6.1): self-action, the
 * last admin, grantable roles, roles that fit the organisation, the issuer for
 * reactivation, and the PIN on every write with its lockout.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_CODES_PER_HOUR } from '@hunarpramaan/contracts';
import { adminEvents, devices, renewalKeys, users } from '../src/db/schema';
import { PIN_RESET_TTL_MS } from '../src/domain/admin-actions';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';
import { buildAssessment, newPhone, pushOk, registerWorker, ticketFor } from '../src/test/scenario';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

/** An admin write, with the PIN unless the body says otherwise. */
const write = (admin: TestUser, path: string, body: object) =>
  h.http
    .post(path)
    .set(admin.auth)
    .send({ pin: PIN, ...body });
const deactivate = (admin: TestUser, target: { id: string }, body: object = {}) =>
  write(admin, `/v1/admin/accounts/${target.id}/deactivate`, {
    reason: 'left_organisation',
    ...body,
  });
const reactivate = (admin: TestUser, target: { id: string }) =>
  write(admin, `/v1/admin/accounts/${target.id}/reactivate`, { reason: 'returned' });
const logCount = async () => (await h.db.select().from(adminEvents)).length;
const statusOf = async (id: string) =>
  (await h.db.select().from(users).where(eq(users.id, id)))[0]?.status;

/** An agency of its own, so organisation-wide rules don't see other tests' admins. */
async function agencyWith(admins: number) {
  const organisationId = await h.organisation('assessment_agency');
  const list: TestUser[] = [];
  for (let i = 0; i < admins; i += 1) {
    list.push(await h.user('agency_admin', `Admin ${i + 1}`, { organisationId }));
  }
  return { organisationId, admins: list };
}

describe('IT-08: separation of duties (FR-31)', () => {
  it('lets nobody act on their own account or phone', async () => {
    const { admins } = await agencyWith(2);
    const [admin] = admins as [TestUser];
    const own = await deactivate(admin, admin);
    expect(own.status).toBe(409);
    expect(own.body.error.code).toBe('self_action');

    const phone = await h.phone(admin);
    const revoke = await write(admin, `/v1/admin/devices/${phone.deviceId}/revoke`, {
      status: 'lost',
      reason: 'lost',
    });
    expect(revoke.status).toBe(409);
    expect(revoke.body.error.code).toBe('self_action');
  });

  it("never deactivates an organisation's last active admin", async () => {
    const operator = await h.user('platform_admin');
    const { organisationId, admins } = await agencyWith(1);
    const [only] = admins as [TestUser];
    const res = await deactivate(operator, only);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('last_admin');

    await h.user('agency_admin', 'Second admin', { organisationId });
    const allowed = await deactivate(operator, only);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    // No phones, so nothing to drain: closed at once.
    expect(allowed.body.status).toBe('closed');
  });

  it('grants only roles from GRANTABLE_ROLES, and logs nothing when it refuses', async () => {
    const { admins } = await agencyWith(1);
    const before = await logCount();
    const res = await write(admins[0]!, '/v1/admin/invites', {
      phone: newPhone(),
      name: 'X Y',
      role: 'awarding_body',
      reason: 'new_staff',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('role_not_grantable');
    expect(await logCount()).toBe(before);
  });

  it('gives an organisation only roles its kind may hold', async () => {
    const operator = await h.user('platform_admin');
    const agency = await h.organisation('assessment_agency');
    const res = await write(operator, '/v1/admin/invites', {
      phone: newPhone(),
      name: 'X Y',
      role: 'tp_admin',
      organisationId: agency,
      reason: 'new_staff',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('role_not_in_org');
  });

  it('keeps every admin write from roles that decide', async () => {
    const target = await h.user('assessor');
    for (const role of ['agency', 'awarding_body', 'master_assessor', 'ncvet'] as const) {
      const decider = await h.user(role);
      expect((await deactivate(decider, target)).status, role).toBe(403);
      const invite = await write(decider, '/v1/admin/invites', {
        phone: newPhone(),
        name: 'X Y',
        role: 'assessor',
        reason: 'new_staff',
      });
      expect(invite.status, role).toBe(403);
    }
  });

  it("answers 'not found' outside the admin's scope", async () => {
    const { admins } = await agencyWith(1);
    const otherAgency = await agencyWith(1);
    const outsider = await h.user('assessor', 'Elsewhere', {
      organisationId: otherAgency.organisationId,
    });
    for (const res of [
      await deactivate(admins[0]!, outsider),
      await h.http.get(`/v1/admin/accounts/${outsider.id}`).set(admins[0]!.auth),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }

    // The platform admin sees an assessor, but acts only on admins and NCVET accounts.
    const operator = await h.user('platform_admin');
    const seen = await h.http.get(`/v1/admin/accounts/${outsider.id}`).set(operator.auth);
    expect(seen.body).toMatchObject({ actionable: false, allowedActions: [] });
    expect((await deactivate(operator, outsider)).status).toBe(404);
  });
});

describe('IT-08: reactivation by the issuer (FR-24)', () => {
  it('refuses another admin, and lets the issuer or the platform admin bring it back', async () => {
    const { admins } = await agencyWith(3);
    const [a, b, c] = admins as [TestUser, TestUser, TestUser];
    // A phone, so the account drains instead of closing at once.
    await h.phone(c);
    expect((await deactivate(a, c)).body.status).toBe('draining');

    const other = await reactivate(b, c);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('not_issuer');

    const operator = await h.user('platform_admin');
    const back = await reactivate(operator, c);
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.status).toBe('active');
    // Older sign-ins never come back: the person signs in again.
    const old = await h.http.get('/v1/admin/accounts').set(c.auth);
    expect(old.body.error.code).toBe('token_revoked');

    await deactivate(a, c);
    expect((await reactivate(a, c)).body.status).toBe('active');
  });

  it("can't bring back a closed account", async () => {
    const { admins } = await agencyWith(2);
    const desk = await h.user('agency', 'Desk', { organisationId: admins[0]!.organisationId });
    expect((await deactivate(admins[0]!, desk)).body.status).toBe('closed');
    const res = await reactivate(admins[0]!, desk);
    expect(res.status).toBe(409);
  });
});

describe('IT-08: the PIN on every admin write (FR-30)', () => {
  it('changes and logs nothing without the right PIN', async () => {
    const { admins } = await agencyWith(2);
    const [admin] = admins as [TestUser];
    const target = await h.user('assessor', 'Target', { organisationId: admin.organisationId });
    const before = await logCount();
    const noPin = { reason: 'left_organisation' };
    for (const res of [
      await h.http.post(`/v1/admin/accounts/${target.id}/deactivate`).set(admin.auth).send(noPin),
      await deactivate(admin, target, { pin: '0000' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('step_up_required');
    }
    expect(await statusOf(target.id)).toBe('active');
    expect(await logCount()).toBe(before);
  });

  it("counts wrong PINs towards the admin's own lockout", async () => {
    const { admins } = await agencyWith(2);
    const [admin] = admins as [TestUser];
    const target = await h.user('assessor', 'Target', { organisationId: admin.organisationId });
    for (let i = 0; i < 5; i += 1) {
      expect((await deactivate(admin, target, { pin: '0000' })).status).toBe(403);
    }
    const locked = await deactivate(admin, target);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('account_locked');
    expect(await statusOf(target.id)).toBe('active');
  });
});

describe('IT-08: the actions', () => {
  it('deactivates with the clips still waiting in view, and the account drains (FR-23)', async () => {
    const { admins } = await agencyWith(2);
    const [admin] = admins as [TestUser];
    const assessor = await h.user('assessor', 'Anil', { organisationId: admin.organisationId });
    const phone = await h.phone(assessor);
    const mobiliser = await h.user('mobiliser');
    const workerId = await registerWorker(h, mobiliser, await h.phone(mobiliser));
    await pushOk(h, assessor, phone, buildAssessment(h, phone, workerId).events);

    const before = await h.http.get(`/v1/admin/accounts/${assessor.id}`).set(admin.auth);
    expect(before.body).toMatchObject({
      clipsWaiting: 8,
      allowedActions: ['reset_pin', 'deactivate'],
    });
    const res = await deactivate(admin, assessor);
    expect(res.body).toMatchObject({ status: 'draining', allowedActions: ['reactivate'] });
    const office = await h.http.get('/v1/trade-packs/csdci-electrician').set(assessor.auth);
    expect(office.body.error.code).toBe('account_deactivated');
  });

  it('unlocks a locked account, and the person signs in at once (FR-25)', async () => {
    const { admins } = await agencyWith(2);
    const [admin] = admins as [TestUser];
    const desk = await h.user('agency', 'Desk', { organisationId: admin.organisationId });
    const { ticket } = await ticketFor(h, desk.phone);
    for (let i = 0; i < 5; i += 1) {
      await h.http.post('/v1/auth/login').send({ ticket, pin: '0000' });
    }
    const listed = await h.http.get(`/v1/admin/accounts/${desk.id}`).set(admin.auth);
    expect(listed.body).toMatchObject({ locked: true });
    expect(listed.body.allowedActions[0]).toBe('unlock');

    const res = await write(admin, `/v1/admin/accounts/${desk.id}/unlock`, {
      reason: 'identity_checked_by_phone',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.locked).toBe(false);
    expect((await h.http.post('/v1/auth/login').send({ ticket, pin: PIN })).status).toBe(200);
  });

  it('issues a one-time PIN reset code that ends every sign-in (FR-26)', async () => {
    const { admins } = await agencyWith(2);
    const [admin] = admins as [TestUser];
    const desk = await h.user('agency', 'Desk', { organisationId: admin.organisationId });
    const res = await write(admin, `/v1/admin/accounts/${desk.id}/pin-reset`, {
      reason: 'forgot_pin',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.code).toMatch(/^\d{8}$/);
    expect((await h.http.get('/v1/sessions').set(desk.auth)).body.error.code).toBe('token_revoked');

    const accept = (ticket: string, code: string, newPin = '305718') =>
      h.http.post('/v1/auth/pin-reset/accept').send({ ticket, code, newPin });
    const { ticket } = await ticketFor(h, desk.phone);
    expect((await accept(ticket, res.body.code, '123456')).body.error.code).toBe('pin_rejected');
    const done = await accept(ticket, res.body.code);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.user.id).toBe(desk.id);

    const again = await ticketFor(h, desk.phone, 16 * 60_000);
    expect((await accept(again.ticket, res.body.code)).body.error.code).toBe('invite_invalid');
    const signIn = await h.http
      .post('/v1/auth/login')
      .send({ ticket: again.ticket, pin: '305718' });
    expect(signIn.status).toBe(200);
  });

  it('ends a PIN reset code after 24 hours', async () => {
    const { admins } = await agencyWith(2);
    const desk = await h.user('agency', 'Desk', { organisationId: admins[0]!.organisationId });
    const res = await write(admins[0]!, `/v1/admin/accounts/${desk.id}/pin-reset`, {
      reason: 'suspected_compromise',
    });
    h.tick(PIN_RESET_TTL_MS + 60_000);
    const { ticket } = await ticketFor(h, desk.phone);
    const late = await h.http
      .post('/v1/auth/pin-reset/accept')
      .send({ ticket, code: res.body.code, newPin: '305718' });
    expect(late.body.error.code).toBe('invite_invalid');
  });

  it('marks a phone lost, ends its renewal keys, and lists the sessions to re-assess (FR-28)', async () => {
    const admin = await h.user('agency_admin');
    const assessor = await h.user('assessor');
    const phone = await h.phone(assessor);
    const key = await h.http
      .post('/v1/auth/renewal-key')
      .set(assessor.auth)
      .send({ deviceId: phone.deviceId });
    expect(key.status).toBe(201);
    const mobiliser = await h.user('mobiliser');
    const workerId = await registerWorker(h, mobiliser, await h.phone(mobiliser), 'Imran Khan');
    const a = buildAssessment(h, phone, workerId);
    await pushOk(h, assessor, phone, a.events);

    const mismatch = await write(admin, `/v1/admin/devices/${phone.deviceId}/revoke`, {
      status: 'retired',
      reason: 'stolen',
    });
    expect(mismatch.status).toBe(400);
    const res = await write(admin, `/v1/admin/devices/${phone.deviceId}/revoke`, {
      status: 'lost',
      reason: 'stolen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: 'lost', allowedActions: [] });
    expect(res.body.sessionsToReassess).toEqual([
      expect.objectContaining({ sessionId: a.sessionId, reason: 'unsigned' }),
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Imran');
    const keys = await h.db
      .select()
      .from(renewalKeys)
      .where(eq(renewalKeys.deviceId, phone.deviceId));
    expect(keys.every((k) => k.revokedAt !== null)).toBe(true);

    const again = await write(admin, `/v1/admin/devices/${phone.deviceId}/revoke`, {
      status: 'lost',
      reason: 'lost',
    });
    expect(again.status).toBe(409);
  });

  it('retires a phone, which drains, and may later report it lost', async () => {
    const admin = await h.user('agency_admin');
    const assessor = await h.user('assessor');
    const phone = await h.phone(assessor);
    const retired = await write(admin, `/v1/admin/devices/${phone.deviceId}/revoke`, {
      status: 'replaced',
      reason: 'replaced',
    });
    expect(retired.body).toMatchObject({ status: 'replaced', allowedActions: ['mark_lost'] });
    const lost = await write(admin, `/v1/admin/devices/${phone.deviceId}/revoke`, {
      status: 'lost',
      reason: 'lost',
    });
    expect(lost.body.status).toBe('lost');
    const [row] = await h.db.select().from(devices).where(eq(devices.id, phone.deviceId));
    expect(row?.revokedAt).not.toBeNull();
  });

  it('allows an admin 30 invites and PIN resets an hour', async () => {
    const { admins } = await agencyWith(1);
    const [admin] = admins as [TestUser];
    for (let i = 0; i < ADMIN_CODES_PER_HOUR; i += 1) {
      const res = await write(admin, '/v1/admin/invites', {
        phone: newPhone(),
        name: `Staff ${i}`,
        role: 'assessor',
        reason: 'new_staff',
      });
      expect(res.status).toBe(201);
    }
    const limited = await write(admin, '/v1/admin/invites', {
      phone: newPhone(),
      name: 'One more',
      role: 'assessor',
      reason: 'new_staff',
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
  });
});

import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountInvites, adminEvents, organisations, qpOwners, users } from '../src/db/schema';
import { BootstrapRefused, bootstrapPlatformAdmin, verifyAdminLog } from '../src/domain/admin';
import { PILOT_ORGANISATIONS, orgKindOf } from '../src/domain/organisations';
import { L3, PIN, startHarness, type Harness } from '../src/test/harness';
import { newPhone, registerWorker, signUpWorker, ticketFor } from '../src/test/scenario';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const accept = (ticket: string, inviteCode: string) =>
  h.http.post('/v1/auth/invite/accept').send({ ticket, inviteCode, pin: '305718' });

describe('FR-19: the first platform admin comes from the bootstrap', () => {
  it('makes an invite with a one-time code, logged with the reason "bootstrap"', async () => {
    const phone = newPhone();
    const invite = await bootstrapPlatformAdmin(h.deps, {
      name: 'Priya Raman',
      phone,
      reason: 'bootstrap',
    });
    expect(invite.code).toMatch(/^\d{8}$/);

    const [row] = await h.db
      .select()
      .from(accountInvites)
      .where(eq(accountInvites.id, invite.inviteId));
    expect(row).toMatchObject({
      role: 'platform_admin',
      organisationId: PILOT_ORGANISATIONS.operator.id,
      invitedBy: null,
    });
    const log = await h.db.select().from(adminEvents).orderBy(asc(adminEvents.seq));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      type: 'account.invited',
      reason: 'bootstrap',
      actorId: invite.inviteId,
      organisationId: PILOT_ORGANISATIONS.operator.id,
      subjectKind: 'invite',
      subjectId: invite.inviteId,
    });
    expect(JSON.stringify(log)).not.toContain(phone);
    expect(await verifyAdminLog(h.db)).toMatchObject({ ok: true, count: 1 });

    // No account exists until the person accepts it with the SMS code and a new PIN.
    const { ticket, account } = await ticketFor(h, phone);
    expect(account).toBe('invited');
    const res = await accept(ticket, invite.code);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.user).toMatchObject({
      role: 'platform_admin',
      organisationId: PILOT_ORGANISATIONS.operator.id,
    });
  });

  it('refuses a second run while a platform admin exists, and changes nothing', async () => {
    const before = await h.db.select().from(adminEvents);
    const second = bootstrapPlatformAdmin(h.deps, {
      name: 'Arvind Menon',
      phone: newPhone(),
      reason: 'bootstrap',
    });
    await expect(second).rejects.toBeInstanceOf(BootstrapRefused);
    expect(await h.db.select().from(adminEvents)).toHaveLength(before.length);

    const additional = await bootstrapPlatformAdmin(h.deps, {
      name: 'Arvind Menon',
      phone: newPhone(),
      reason: 'bootstrap',
      additional: true,
    });
    expect(additional.code).toMatch(/^\d{8}$/);
  });

  it('needs the reason "bootstrap", a name and a mobile number', async () => {
    const run = (input: { name: string; phone: string; reason: string }) =>
      bootstrapPlatformAdmin(h.deps, { ...input, additional: true });
    await expect(run({ name: 'X', phone: newPhone(), reason: 'new_staff' })).rejects.toThrow(
      BootstrapRefused,
    );
    await expect(run({ name: ' ', phone: newPhone(), reason: 'bootstrap' })).rejects.toThrow(
      BootstrapRefused,
    );
    await expect(run({ name: 'X', phone: '12345', reason: 'bootstrap' })).rejects.toThrow(
      BootstrapRefused,
    );
  });
});

describe('organisations (ADR 010)', () => {
  it('has the pilot organisations from migration 0008, with CSDCI owning both QPs', async () => {
    const rows = await h.db.select().from(organisations);
    for (const [kind, org] of Object.entries(PILOT_ORGANISATIONS)) {
      expect(rows.find((r) => r.id === org.id)).toMatchObject({
        kind,
        name: org.name,
        status: 'active',
      });
    }
    const owners = await h.db.select().from(qpOwners);
    expect(owners.map((o) => o.nqrCode).sort()).toEqual([L3, 'QG-04-CO-03952-2025-V2-CSDCI']);
    expect(new Set(owners.map((o) => o.organisationId))).toEqual(
      new Set([PILOT_ORGANISATIONS.awarding_body.id]),
    );
  });

  it('puts every role in exactly one kind of organisation', () => {
    expect(orgKindOf('assessor')).toBe('assessment_agency');
    expect(orgKindOf('master_assessor')).toBe('awarding_body');
    expect(orgKindOf('worker')).toBe('training_partner');
  });

  it("signs in with the account's own organisation in the token", async () => {
    const bhopal = await h.organisation('assessment_agency', 'Bhopal Skills Assessment');
    const assessor = await h.user('assessor', 'Vikram Rathore', { organisationId: bhopal });
    const { ticket } = await ticketFor(h, assessor.phone);
    const res = await h.http.post('/v1/auth/login').send({ ticket, pin: PIN });
    expect(res.status).toBe(200);
    expect(res.body.user.organisationId).toBe(bhopal);
  });

  it("refuses a token whose organisation is not the account's", async () => {
    const assessor = await h.user('assessor');
    await h.db
      .update(users)
      .set({ organisationId: await h.organisation('assessment_agency') })
      .where(eq(users.id, assessor.id));
    const res = await h.http.get('/v1/sync/pull').set(assessor.auth);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('token_revoked');
  });
});

describe('invites into an organisation', () => {
  const invite = (auth: { Authorization: string }, body: object) =>
    h.http.post('/v1/admin/invites').set(auth).send(body);

  it('lets the platform admin invite an organisation admin into that organisation', async () => {
    const operator = await h.user('platform_admin');
    const agency = await h.organisation('assessment_agency');
    const phone = newPhone();
    const res = await invite(operator.auth, {
      phone,
      name: 'Gaurav Saxena',
      role: 'agency_admin',
      organisationId: agency,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [entry] = await h.db
      .select()
      .from(adminEvents)
      .where(eq(adminEvents.subjectId, res.body.inviteId));
    // Logged under the organisation the account will belong to.
    expect(entry).toMatchObject({ organisationId: agency, actorId: operator.id });

    const { ticket } = await ticketFor(h, phone);
    const accepted = await accept(ticket, res.body.code);
    expect(accepted.body.user).toMatchObject({ role: 'agency_admin', organisationId: agency });
  });

  it('refuses a role the organisation kind cannot hold, and logs nothing', async () => {
    const operator = await h.user('platform_admin');
    const before = (await h.db.select().from(adminEvents)).length;
    const res = await invite(operator.auth, {
      phone: newPhone(),
      name: 'X Y',
      role: 'agency_admin',
      organisationId: PILOT_ORGANISATIONS.training_partner.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('role_not_in_org');
    expect(await h.db.select().from(adminEvents)).toHaveLength(before);
  });

  it('keeps organisation admins in their own organisation', async () => {
    const admin = await h.user('agency_admin');
    const other = await h.organisation('assessment_agency');
    const outside = await invite(admin.auth, {
      phone: newPhone(),
      name: 'X Y',
      role: 'assessor',
      organisationId: other,
    });
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('not_found');

    const phone = newPhone();
    const own = await invite(admin.auth, { phone, name: 'Neha Gupta', role: 'assessor' });
    expect(own.status).toBe(201);
    const { ticket } = await ticketFor(h, phone);
    const accepted = await accept(ticket, own.body.code);
    expect(accepted.body.user.organisationId).toBe(admin.organisationId);
  });

  it('refuses an invite into a suspended organisation', async () => {
    const operator = await h.user('platform_admin');
    const agency = await h.organisation('assessment_agency');
    await h.db
      .update(organisations)
      .set({ status: 'suspended' })
      .where(eq(organisations.id, agency));
    const res = await invite(operator.auth, {
      phone: newPhone(),
      name: 'X Y',
      role: 'agency_admin',
      organisationId: agency,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('organisation_suspended');
  });
});

describe('workers belong to a training partner', () => {
  it('joins the training partner of the mobiliser who registered the number', async () => {
    const centre = await h.organisation('training_partner', 'Bhopal RPL Centre');
    const mobiliser = await h.user('mobiliser', 'Sunita Verma', { organisationId: centre });
    const phone = newPhone();
    await registerWorker(h, mobiliser, await h.phone(mobiliser), 'Imran Khan', phone);
    const { worker, claimed } = await signUpWorker(h, phone);
    expect(claimed).toBe(true);
    expect(worker.organisationId).toBe(centre);
  });
});

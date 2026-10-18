/**
 * The admin read models (FR-21, FR-27, FR-29, FR-32), and the admin half of
 * IT-05: two agencies never see each other's accounts, phones, invites or log.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountInvites, devices, users } from '../src/db/schema';
import { STALE_AFTER_MS } from '../src/domain/admin-views';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';
import { newPhone, ticketFor } from '../src/test/scenario';

let h: Harness;
let indore: string;
let bhopal: string;
let indoreAdmin: TestUser;
let bhopalAdmin: TestUser;
let anil: TestUser;
let vikram: TestUser;
let operator: TestUser;

beforeAll(async () => {
  h = await startHarness();
  indore = await h.organisation('assessment_agency', 'Indore Assessment Agency');
  bhopal = await h.organisation('assessment_agency', 'Bhopal Skills Assessment');
  indoreAdmin = await h.user('agency_admin', 'Farhan Qureshi', { organisationId: indore });
  await h.user('agency_admin', 'Meera Kulkarni', { organisationId: indore });
  bhopalAdmin = await h.user('agency_admin', 'Gaurav Saxena', { organisationId: bhopal });
  anil = await h.user('assessor', 'Anil Sharma', { organisationId: indore });
  vikram = await h.user('assessor', 'Vikram Rathore', { organisationId: bhopal });
  operator = await h.user('platform_admin', 'Priya Raman');
});
afterAll(() => h.close());

const get = (user: TestUser, path: string) => h.http.get(path).set(user.auth);
const names = (body: { items: { name?: string; ownerName?: string }[] }) =>
  body.items.map((i) => i.name ?? i.ownerName);

describe('People (FR-21)', () => {
  it("lists only the admin's own organisation, every number masked", async () => {
    const res = await get(indoreAdmin, '/v1/admin/accounts');
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['Anil Sharma', 'Farhan Qureshi', 'Meera Kulkarni']);
    expect(res.body.items.every((i: { phone: string }) => /^X{6}\d{4}$/.test(i.phone))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(anil.phone);
    expect(res.body.items.find((i: { id: string }) => i.id === indoreAdmin.id).actionable).toBe(
      false,
    );
  });

  it('filters by role and status, and searches by name or the last 4 digits only', async () => {
    const admins = await get(indoreAdmin, '/v1/admin/accounts?role=admin');
    expect(names(admins.body)).toEqual(['Farhan Qureshi', 'Meera Kulkarni']);
    const assessors = await get(indoreAdmin, '/v1/admin/accounts?role=assessor');
    expect(names(assessors.body)).toEqual(['Anil Sharma']);
    expect(names((await get(indoreAdmin, '/v1/admin/accounts?q=meera')).body)).toEqual([
      'Meera Kulkarni',
    ]);
    const last4 = await get(indoreAdmin, `/v1/admin/accounts?q=${anil.phone.slice(-4)}`);
    expect(names(last4.body)).toEqual(['Anil Sharma']);
    const middle = await get(indoreAdmin, `/v1/admin/accounts?q=${anil.phone.slice(2, 8)}`);
    expect(middle.body.items).toEqual([]);
  });

  it('shows a locked account as locked, with the time it unlocks', async () => {
    const until = new Date(h.deps.now().getTime() + 30 * 60_000);
    const desk = await h.user('agency', 'Nisha Rao', { organisationId: indore });
    await h.db.update(users).set({ lockedUntil: until }).where(eq(users.id, desk.id));
    const res = await get(indoreAdmin, '/v1/admin/accounts?status=locked');
    expect(res.body.items).toEqual([
      expect.objectContaining({
        name: 'Nisha Rao',
        locked: true,
        lockedUntil: until.toISOString(),
      }),
    ]);
  });

  it('shows the last sign-in and the last sync', async () => {
    const { ticket } = await ticketFor(h, anil.phone);
    await h.http.post('/v1/auth/login').send({ ticket, pin: PIN });
    const phone = await h.phone(anil);
    await h.db
      .update(devices)
      .set({ lastSyncAt: h.deps.now() })
      .where(eq(devices.id, phone.deviceId));
    const res = await get(indoreAdmin, `/v1/admin/accounts/${anil.id}`);
    expect(res.body.lastSignInAt).toBe(h.deps.now().toISOString());
    expect(res.body.lastSyncAt).toBe(h.deps.now().toISOString());
    expect(res.body.devices).toEqual([expect.objectContaining({ id: phone.deviceId })]);
  });

  it('lets the platform admin see every organisation, and act only on admins and NCVET', async () => {
    const all = await get(operator, '/v1/admin/accounts');
    expect(names(all.body)).toEqual(expect.arrayContaining(['Anil Sharma', 'Vikram Rathore']));
    const anilRow = all.body.items.find((i: { id: string }) => i.id === anil.id);
    expect(anilRow.actionable).toBe(false);
    const adminRow = all.body.items.find((i: { id: string }) => i.id === bhopalAdmin.id);
    expect(adminRow.actionable).toBe(true);

    const filtered = await get(operator, `/v1/admin/accounts?organisationId=${bhopal}`);
    expect(names(filtered.body)).toEqual(['Gaurav Saxena', 'Vikram Rathore']);
  });

  it('never lists workers: no admin manages them', async () => {
    const tpAdmin = await h.user('tp_admin');
    await h.user('worker', 'Kavita Joshi');
    const res = await get(tpAdmin, '/v1/admin/accounts');
    expect(names(res.body)).not.toContain('Kavita Joshi');
  });

  it('lists the organisations the admin may see', async () => {
    expect((await get(indoreAdmin, '/v1/admin/organisations')).body).toEqual([
      expect.objectContaining({ id: indore, kind: 'assessment_agency', status: 'active' }),
    ]);
    const all = await get(operator, '/v1/admin/organisations');
    expect(all.body.length).toBeGreaterThan(5);
  });
});

describe('Invites (FR-22)', () => {
  it('shows pending, accepted, replaced and expired invites, newest first', async () => {
    const invite = (phone: string, name: string) =>
      h.http
        .post('/v1/admin/invites')
        .set(indoreAdmin.auth)
        .send({ phone, name, role: 'agency', reason: 'new_staff', pin: PIN });
    const expiring = newPhone();
    await invite(expiring, 'Old Invite');
    await h.db
      .update(accountInvites)
      .set({ expiresAt: new Date(h.deps.now().getTime() - 60_000) })
      .where(eq(accountInvites.phone, expiring));
    h.tick();
    const replaced = newPhone();
    await invite(replaced, 'First Try');
    await invite(replaced, 'Second Try');
    const accepted = newPhone();
    const made = await invite(accepted, 'Asha Verma');
    const { ticket } = await ticketFor(h, accepted);
    await h.http
      .post('/v1/auth/invite/accept')
      .send({ ticket, inviteCode: made.body.code, pin: '305718' });

    const res = await get(indoreAdmin, '/v1/admin/invites');
    const byName = Object.fromEntries(
      res.body.items.map((i: { name: string; status: string }) => [i.name, i.status]),
    );
    expect(byName).toEqual({
      'Asha Verma': 'accepted',
      'Second Try': 'pending',
      'First Try': 'replaced',
      'Old Invite': 'expired',
    });
    expect(res.body.items[0].invitedBy).toBe('Farhan Qureshi');
    const pending = await get(indoreAdmin, '/v1/admin/invites?status=pending');
    expect(names(pending.body)).toEqual(['Second Try']);
    expect((await get(bhopalAdmin, '/v1/admin/invites')).body.items).toEqual([]);
  });
});

describe('Devices (FR-27)', () => {
  it('lists phones with owner and status, and finds those not synced for 3 days', async () => {
    const admin = await h.user('agency_admin', 'Devices Admin', { organisationId: bhopal });
    const fresh = await h.phone(vikram);
    const stale = await h.phone(vikram);
    await h.db
      .update(devices)
      .set({ lastSyncAt: h.deps.now() })
      .where(eq(devices.id, fresh.deviceId));
    await h.db
      .update(devices)
      .set({ lastSyncAt: new Date(h.deps.now().getTime() - STALE_AFTER_MS - 86_400_000) })
      .where(eq(devices.id, stale.deviceId));

    const all = await get(admin, '/v1/admin/devices');
    expect(all.body.items.map((d: { id: string }) => d.id).sort()).toEqual(
      [fresh.deviceId, stale.deviceId].sort(),
    );
    expect(all.body.items[0]).toMatchObject({ ownerName: 'Vikram Rathore', status: 'registered' });
    const behind = await get(admin, '/v1/admin/devices?stale=true');
    expect(behind.body.items.map((d: { id: string }) => d.id)).toEqual([stale.deviceId]);
  });
});

describe('IT-05 (admin half): organisations are kept apart', () => {
  it("answers 'not found' for another agency's account, phone and log", async () => {
    const phone = await h.phone(vikram);
    for (const path of [`/v1/admin/accounts/${vikram.id}`, `/v1/admin/devices/${phone.deviceId}`]) {
      const res = await get(indoreAdmin, path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    const accounts = await get(indoreAdmin, '/v1/admin/accounts');
    expect(names(accounts.body)).not.toContain('Vikram Rathore');
    const phones = await get(indoreAdmin, '/v1/admin/devices');
    expect(names(phones.body)).not.toContain('Vikram Rathore');

    await h.http
      .post(`/v1/admin/devices/${phone.deviceId}/revoke`)
      .set(bhopalAdmin.auth)
      .send({ status: 'retired', reason: 'retired', pin: PIN });
    const indoreLog = await get(indoreAdmin, '/v1/admin/log');
    expect(
      indoreLog.body.items.every((e: { organisationId: string }) => e.organisationId === indore),
    ).toBe(true);
    const bhopalLog = await get(bhopalAdmin, '/v1/admin/log');
    expect(bhopalLog.body.items.map((e: { type: string }) => e.type)).toContain('device.revoked');
    // The platform admin sees every organisation's log.
    const all = await get(operator, '/v1/admin/log');
    const orgs = new Set(all.body.items.map((e: { organisationId: string }) => e.organisationId));
    expect(orgs).toEqual(new Set([indore, bhopal]));
  });

  it('keeps admins away from case data, and office roles away from the admin panel (FR-20)', async () => {
    expect((await get(indoreAdmin, '/v1/sessions')).status).toBe(403);
    expect((await get(indoreAdmin, '/v1/dashboard/summary')).status).toBe(403);
    const agency = await h.user('agency');
    expect((await get(agency, '/v1/admin/accounts')).status).toBe(403);
    expect((await get(agency, '/v1/admin/log')).status).toBe(403);
  });
});

describe('NCVET governance view (FR-32)', () => {
  it('sees counts by organisation kind and action, and the chain check, with no names or numbers', async () => {
    const ncvet = await h.user('ncvet');
    expect((await get(ncvet, '/v1/admin/log')).status).toBe(403);
    expect((await get(ncvet, '/v1/admin/accounts')).status).toBe(403);
    const verify = await get(ncvet, '/v1/admin/log/verify');
    expect(verify.body).toMatchObject({ ok: true });

    const res = await get(ncvet, '/v1/governance');
    expect(res.status).toBe(200);
    const rows = res.body.weeks.flatMap((w: { rows: object[] }) => w.rows);
    expect(rows).toEqual(
      expect.arrayContaining([
        { orgKind: 'assessment_agency', type: 'account.invited', count: expect.any(Number) },
        { orgKind: 'assessment_agency', type: 'device.revoked', count: 1 },
      ]),
    );
    const json = JSON.stringify(res.body);
    for (const leak of ['Farhan', 'Asha', 'Vikram', vikram.phone, indore, bhopal]) {
      expect(json).not.toContain(leak);
    }
  });
});

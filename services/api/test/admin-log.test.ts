/**
 * IT-10: every admin write appends exactly one admin-log entry, in the same
 * transaction, and editing one entry makes verification fail at that entry
 * (FR-29, NFR-12).
 */
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminEvents, users } from '../src/db/schema';
import { deactivateAccount } from '../src/domain/admin-actions';
import { PIN, startHarness, type Harness, type TestUser } from '../src/test/harness';
import { newPhone } from '../src/test/scenario';

let h: Harness;
let admin: TestUser;

beforeAll(async () => {
  h = await startHarness();
  admin = await h.user('agency_admin', 'Farhan Qureshi');
  await h.user('agency_admin', 'Meera Kulkarni');
});
afterAll(() => h.close());

const write = (path: string, body: object) =>
  h.http
    .post(path)
    .set(admin.auth)
    .send({ pin: PIN, ...body });
const entries = () => h.db.select().from(adminEvents).orderBy(asc(adminEvents.seq));

describe('IT-10: the admin log', () => {
  it('appends exactly one entry for every admin write, with who, what, whom and why', async () => {
    const assessor = await h.user('assessor', 'Anil Sharma');
    const phone = await h.phone(assessor);
    const locked = await h.user('agency', 'Nisha Rao');
    await h.db
      .update(users)
      .set({ lockedUntil: new Date(h.deps.now().getTime() + 600_000) })
      .where(eq(users.id, locked.id));

    const inviteePhone = newPhone();
    const writes: [string, object, string, string, string][] = [
      [
        '/v1/admin/invites',
        { phone: inviteePhone, name: 'Asha Verma', role: 'assessor', reason: 'replacement' },
        'account.invited',
        'invite',
        'replacement',
      ],
      [
        `/v1/admin/accounts/${locked.id}/unlock`,
        { reason: 'identity_checked_in_person' },
        'account.unlocked',
        'account',
        'identity_checked_in_person',
      ],
      [
        `/v1/admin/accounts/${locked.id}/pin-reset`,
        { reason: 'forgot_pin' },
        'account.pin_reset',
        'account',
        'forgot_pin',
      ],
      [
        `/v1/admin/devices/${phone.deviceId}/revoke`,
        { status: 'retired', reason: 'retired' },
        'device.revoked',
        'device',
        'retired',
      ],
      [
        `/v1/admin/accounts/${assessor.id}/deactivate`,
        { reason: 'role_ended' },
        'account.deactivated',
        'account',
        'role_ended',
      ],
      [
        `/v1/admin/accounts/${assessor.id}/reactivate`,
        { reason: 'deactivated_in_error' },
        'account.reactivated',
        'account',
        'deactivated_in_error',
      ],
    ];
    for (const [path, body, type, subjectKind, reason] of writes) {
      const before = await entries();
      const res = await write(path, body);
      expect(res.status, `${path} ${JSON.stringify(res.body)}`).toBeLessThan(300);
      const after = await entries();
      expect(after, path).toHaveLength(before.length + 1);
      expect(after.at(-1)).toMatchObject({
        type,
        subjectKind,
        reason,
        actorId: admin.id,
        organisationId: admin.organisationId,
      });
    }

    // A refused write appends nothing.
    const before = (await entries()).length;
    expect(
      (await write(`/v1/admin/accounts/${admin.id}/deactivate`, { reason: 'role_ended' })).status,
    ).toBe(409);
    expect(await entries()).toHaveLength(before);

    // Ids and reason codes only (ADR 011).
    const log = JSON.stringify(await entries());
    for (const personal of ['Anil', 'Nisha', 'Asha', inviteePhone, assessor.phone, locked.phone]) {
      expect(log).not.toContain(personal);
    }
  });

  it('shows each action once, newest first, with names worked out when read', async () => {
    const res = await h.http.get('/v1/admin/log').set(admin.auth);
    expect(res.status).toBe(200);
    const seqs = res.body.items.map((e: { seq: number }) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(res.body.items[0]).toMatchObject({
      type: 'account.reactivated',
      actorName: 'Farhan Qureshi',
      subjectName: 'Anil Sharma',
      reason: 'deactivated_in_error',
    });
    const invited = res.body.items.find((e: { type: string }) => e.type === 'account.invited');
    expect(invited.subjectName).toBe('Asha Verma');

    const filtered = await h.http.get('/v1/admin/log?type=device.revoked').set(admin.auth);
    expect(filtered.body.items.map((e: { type: string }) => e.type)).toEqual(['device.revoked']);
  });

  it('changes nothing when the log entry cannot be written', async () => {
    const assessor = await h.user('assessor');
    await h.phone(assessor);
    const before = (await entries()).length;
    // A reason that doesn't fit the action fails inside the transaction, after the state change.
    await expect(
      deactivateAccount(h.deps, admin, assessor.id, 'forgot_pin' as never),
    ).rejects.toThrow();
    const [row] = await h.db.select().from(users).where(eq(users.id, assessor.id));
    expect(row?.status).toBe('active');
    expect(await entries()).toHaveLength(before);
  });

  it('verifies, and fails at the entry someone edited in the database', async () => {
    const ok = await h.http.get('/v1/admin/log/verify').set(admin.auth);
    expect(ok.body).toMatchObject({ ok: true, failedAtSeq: null });
    expect(ok.body.entries).toBe((await entries()).length);

    const target = (await entries())[2]!;
    await h.db.execute(sql`alter table admin_events disable trigger admin_events_append_only`);
    await h.db
      .update(adminEvents)
      .set({ reason: 'left_organisation' })
      .where(eq(adminEvents.id, target.id));
    await h.db.execute(sql`alter table admin_events enable trigger admin_events_append_only`);

    const broken = await h.http.get('/v1/admin/log/verify').set(admin.auth);
    expect(broken.body).toMatchObject({ ok: false, failedAtSeq: target.seq });
  });
});

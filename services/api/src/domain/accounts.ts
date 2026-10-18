/**
 * Account and phone status (ADR 010 point 8, TRD section 6.3). A deactivated
 * account drains: its phones may still sync what they recorded, which is
 * flagged for review, but it can't sign in and nothing new may start. It is
 * read as closed 30 days after the last sync from its phones, or at once with
 * none, so no scheduler is needed. A lost phone is refused outright.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AccountStatus, DeviceStatus } from '@hunarpramaan/contracts';
import type { Db, Tx } from '../db/client';
import { devices, organisations, users } from '../db/schema';
import { HttpError } from '../http/errors';

const DAY = 24 * 60 * 60_000;

/** How long a deactivated account's phones may keep syncing; the renewal-key limit too. */
export const DRAIN_MS = 30 * DAY;

type UserRow = typeof users.$inferSelect;

export interface PhoneState {
  status: DeviceStatus;
  lastSyncAt: Date | null;
}

export const accountDeactivated = () =>
  new HttpError(401, 'account_deactivated', 'This account was deactivated');
export const organisationSuspended = () =>
  new HttpError(403, 'organisation_suspended', 'This organisation is suspended');
export const deviceLost = () =>
  new HttpError(403, 'device_lost', 'This phone was reported lost; nothing from it is accepted');

/**
 * The account's status now. A draining account closes 30 days after the later
 * of its deactivation and its last sync, counting only phones whose work can
 * still arrive (not lost ones), and at once when it has none.
 */
export function accountStatus(
  account: Pick<UserRow, 'status' | 'statusChangedAt'>,
  phones: readonly PhoneState[],
  now: Date,
): AccountStatus {
  if (account.status !== 'draining') return account.status;
  const draining = phones.filter((p) => p.status !== 'lost');
  if (draining.length === 0) return 'closed';
  const last = Math.max(
    account.statusChangedAt?.getTime() ?? 0,
    ...draining.map((p) => p.lastSyncAt?.getTime() ?? 0),
  );
  return now.getTime() - last >= DRAIN_MS ? 'closed' : 'draining';
}

/** Each account's phones, for `accountStatus`. */
export async function phonesOf(db: Db | Tx, userIds: string[]) {
  const byUser = new Map<string, PhoneState[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({ userId: devices.userId, status: devices.status, lastSyncAt: devices.lastSyncAt })
    .from(devices)
    .where(inArray(devices.userId, userIds));
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  return byUser;
}

export async function currentStatus(db: Db | Tx, account: UserRow, now: Date) {
  if (account.status !== 'draining') return account.status;
  return accountStatus(account, (await phonesOf(db, [account.id])).get(account.id) ?? [], now);
}

/**
 * The account that holds this number, if it isn't closed. A draining account
 * that has run its course is stored as closed here, which frees the number for
 * a new account (one active account per number, ADR 010 point 2).
 */
export async function openAccountByPhone(
  db: Db | Tx,
  phone: string,
  now: Date,
): Promise<UserRow | null> {
  const [account] = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, phone), ne(users.status, 'closed')));
  if (!account) return null;
  if ((await currentStatus(db, account, now)) !== 'closed') return account;
  await db
    .update(users)
    .set({ status: 'closed' })
    .where(and(eq(users.id, account.id), eq(users.status, 'draining')));
  return null;
}

/** Signing in needs an active account in an active organisation. */
export async function assertCanSignIn(db: Db | Tx, account: UserRow, now: Date) {
  if ((await currentStatus(db, account, now)) !== 'active') throw accountDeactivated();
  const [organisation] = await db
    .select({ status: organisations.status })
    .from(organisations)
    .where(eq(organisations.id, account.organisationId));
  if (organisation?.status !== 'active') throw organisationSuspended();
}

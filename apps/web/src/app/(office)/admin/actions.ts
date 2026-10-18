'use server';

/**
 * Admin actions (ADR 010). Every one sends the admin's own PIN again (step-up);
 * the API checks it, the grant rules and the scope, and records the action in
 * the hash-chained admin log. Nothing here decides about a worker.
 */
import {
  AdminErrorCode,
  AdminLogVerify,
  CreateOrganisationResponse,
  InviteIssued,
} from '@hunarpramaan/contracts';
import { z } from 'zod';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
import { fill, getMessages, type Messages } from '@/lib/i18n';

export type AdminState = {
  ok?: boolean;
  message?: string;
  /** A one-time code to show once: after an invite or a new organisation. */
  invite?: { code: string; expiresAt: string; name: string };
};

const Ok = z.object({}).passthrough();
const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function failure(error: unknown, m: Messages): AdminState {
  if (error instanceof ApiRequestError) {
    const code = AdminErrorCode.safeParse(error.code);
    if (code.success) return { ok: false, message: m.admin.errors[code.data] };
    return {
      ok: false,
      message: fill(m.admin.failed, { message: [error.message, ...error.details].join(' ') }),
    };
  }
  return { ok: false, message: m.login.unreachable };
}

export async function inviteAccount(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { m } = await getMessages();
  const name = field(form, 'name');
  try {
    const invite = await apiPost(
      '/v1/admin/invites',
      {
        orgId: field(form, 'orgId'),
        role: field(form, 'role'),
        name,
        phone: field(form, 'phone').replace(/[\s-]/g, ''),
        pin: field(form, 'pin'),
      },
      InviteIssued,
    );
    return { ok: true, invite: { code: invite.code, expiresAt: invite.expiresAt, name } };
  } catch (error) {
    return failure(error, m);
  }
}

async function accountAction(
  path: 'deactivate' | 'reactivate' | 'unlock',
  accountId: string,
  name: string,
  form: FormData,
): Promise<AdminState> {
  const { m } = await getMessages();
  const body =
    path === 'deactivate'
      ? { reason: field(form, 'reason'), pin: field(form, 'pin') }
      : { pin: field(form, 'pin') };
  try {
    await apiPost(`/v1/admin/people/${z.uuid().parse(accountId)}/${path}`, body, Ok);
    const done = {
      deactivate: m.admin.people.deactivated,
      reactivate: m.admin.people.reactivated,
      unlock: m.admin.people.unlocked,
    }[path];
    return { ok: true, message: fill(done, { name }) };
  } catch (error) {
    return failure(error, m);
  }
}

export async function deactivateAccount(
  id: string,
  name: string,
  _prev: AdminState,
  form: FormData,
) {
  return accountAction('deactivate', id, name, form);
}
export async function reactivateAccount(
  id: string,
  name: string,
  _prev: AdminState,
  form: FormData,
) {
  return accountAction('reactivate', id, name, form);
}
export async function unlockAccount(id: string, name: string, _prev: AdminState, form: FormData) {
  return accountAction('unlock', id, name, form);
}

export async function revokeDevice(
  deviceId: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const { m } = await getMessages();
  const lostSince = field(form, 'lostSince');
  try {
    await apiPost(
      `/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        reason: field(form, 'reason'),
        pin: field(form, 'pin'),
        // datetime-local gives local time without an offset; the office is in India.
        ...(lostSince && { lostSince: new Date(`${lostSince}:00+05:30`).toISOString() }),
      },
      Ok,
    );
    return { ok: true, message: m.admin.devices.revoked };
  } catch (error) {
    return failure(error, m);
  }
}

export async function createOrganisation(_prev: AdminState, form: FormData): Promise<AdminState> {
  const { m } = await getMessages();
  const name = field(form, 'name');
  const adminName = field(form, 'adminName');
  try {
    const res = await apiPost(
      '/v1/admin/organisations',
      {
        name,
        kind: field(form, 'kind'),
        firstAdmin: { name: adminName, phone: field(form, 'adminPhone').replace(/[\s-]/g, '') },
        pin: field(form, 'pin'),
      },
      CreateOrganisationResponse,
    );
    return {
      ok: true,
      message:
        fill(m.admin.organisations.created, { name: res.organisation.name }) +
        (res.invite ? '' : ` ${m.admin.organisations.noInvite}`),
      ...(res.invite && {
        invite: { code: res.invite.code, expiresAt: res.invite.expiresAt, name: adminName },
      }),
    };
  } catch (error) {
    return failure(error, m);
  }
}

export async function suspendOrganisation(
  id: string,
  name: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const { m } = await getMessages();
  try {
    await apiPost(
      `/v1/admin/organisations/${z.uuid().parse(id)}/suspend`,
      { reason: field(form, 'reason'), pin: field(form, 'pin') },
      Ok,
    );
    return { ok: true, message: fill(m.admin.organisations.suspended, { name }) };
  } catch (error) {
    return failure(error, m);
  }
}

export async function reactivateOrganisation(
  id: string,
  name: string,
  _prev: AdminState,
  form: FormData,
): Promise<AdminState> {
  const { m } = await getMessages();
  try {
    await apiPost(
      `/v1/admin/organisations/${z.uuid().parse(id)}/reactivate`,
      { pin: field(form, 'pin') },
      Ok,
    );
    return { ok: true, message: fill(m.admin.organisations.reactivated, { name }) };
  } catch (error) {
    return failure(error, m);
  }
}

export type VerifyState = { result?: AdminLogVerify; message?: string };

export async function verifyAdminLog(): Promise<VerifyState> {
  const { m } = await getMessages();
  try {
    return { result: await apiGet('/v1/admin/log/verify', AdminLogVerify) };
  } catch (error) {
    return { message: failure(error, m).message ?? m.login.unreachable };
  }
}

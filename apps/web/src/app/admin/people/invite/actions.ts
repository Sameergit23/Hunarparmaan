'use server';

import { CreateInviteResponse } from '@hunarpramaan/contracts';
import type { AdminActionState } from '@/components/confirm-action';
import { adminWrite } from '@/lib/admin';
import { apiPost } from '@/lib/api';

/**
 * POST /v1/admin/invites with the admin's PIN. The code comes back once and is
 * shown once; the page never stores it.
 */
export async function createInvite(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  return adminWrite(async () => {
    const organisationId = text('organisationId');
    const invite = await apiPost(
      '/v1/admin/invites',
      {
        name: text('name'),
        phone: text('phone').replace(/[\s-]/g, ''),
        role: text('role'),
        reason: text('reason'),
        pin: text('pin'),
        ...(organisationId && { organisationId }),
      },
      CreateInviteResponse,
    );
    return { ok: true, code: invite.code };
  });
}

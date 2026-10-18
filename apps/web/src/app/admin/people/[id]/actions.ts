'use server';

import { AccountDetail, PinResetResponse, type AccountAction } from '@hunarpramaan/contracts';
import { z } from 'zod';
import type { AdminActionState } from '@/components/confirm-action';
import { adminWrite } from '@/lib/admin';
import { apiPost } from '@/lib/api';

const PATHS: Record<AccountAction, string> = {
  deactivate: 'deactivate',
  reactivate: 'reactivate',
  unlock: 'unlock',
  reset_pin: 'pin-reset',
};

/**
 * An admin write on an account, with the reason and the admin's PIN. No
 * revalidatePath (ADR 009): the dialog refreshes the page itself, so a PIN
 * reset's code can be shown first.
 */
export async function accountAction(
  accountId: string,
  action: AccountAction,
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return adminWrite(async () => {
    const path = `/v1/admin/accounts/${z.uuid().parse(accountId)}/${PATHS[action]}`;
    const body = {
      reason: String(formData.get('reason') ?? ''),
      pin: String(formData.get('pin') ?? '').trim(),
    };
    if (action === 'reset_pin') {
      const reset = await apiPost(path, body, PinResetResponse);
      return { ok: true, code: reset.code };
    }
    await apiPost(path, body, AccountDetail);
    return { ok: true };
  });
}

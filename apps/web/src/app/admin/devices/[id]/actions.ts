'use server';

import { DEVICE_STATUS_FOR_REASON, DeviceDetail } from '@hunarpramaan/contracts';
import { z } from 'zod';
import type { AdminActionState } from '@/components/confirm-action';
import { adminWrite } from '@/lib/admin';
import { apiPost } from '@/lib/api';

const reasonSchema = z.enum(
  Object.keys(DEVICE_STATUS_FOR_REASON) as [keyof typeof DEVICE_STATUS_FOR_REASON],
);

/**
 * Mark a phone lost, or retire it. The reason decides the status (lost or
 * stolen phones are refused; replaced or retired ones drain), so the admin log's
 * reason alone says what happened.
 */
export async function deviceAction(
  deviceId: string,
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return adminWrite(async () => {
    const reason = reasonSchema.parse(formData.get('reason'));
    await apiPost(
      `/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        status: DEVICE_STATUS_FOR_REASON[reason],
        reason,
        pin: String(formData.get('pin') ?? '').trim(),
      },
      DeviceDetail,
    );
    return { ok: true };
  });
}

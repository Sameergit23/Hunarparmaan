'use server';

import { AdminLogVerification } from '@hunarpramaan/contracts';
import { unstable_rethrow } from 'next/navigation';
import { ApiRequestError, apiGet } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { adminErrorText } from '@/lib/messages';

export type VerifyState = { result?: AdminLogVerification; error?: string };

/** "Verify chain": the API re-checks the whole admin log from its first entry (FR-29). */
export async function verifyAdminChain(): Promise<VerifyState> {
  try {
    return { result: await apiGet('/v1/admin/log/verify', AdminLogVerification) };
  } catch (error) {
    unstable_rethrow(error);
    const { m, lang } = await getMessages();
    return {
      error:
        error instanceof ApiRequestError
          ? adminErrorText(error, m, lang)
          : m.admin.errors.unreachable,
    };
  }
}

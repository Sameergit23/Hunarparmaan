'use server';

import { ApproveResponse } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { ApiRequestError, apiPost } from '@/lib/api';
import { fill, getMessages } from '@/lib/i18n';

export type DecisionState = { message?: string; ok?: boolean };

/** The awarding body's decision. The API refuses an approval while anything blocks it. */
export async function decide(
  recommendationId: string,
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const { m } = await getMessages();
  const decision = formData.get('decision') === 'returned' ? 'returned' : 'approved';
  const note = String(formData.get('note') ?? '').trim();
  try {
    const res = await apiPost(
      `/v1/recommendations/${z.uuid().parse(recommendationId)}/approve`,
      decision === 'returned' ? { decision, note } : { decision },
      ApproveResponse,
    );
    // No revalidatePath: it would also refresh this page and drop the decided card,
    // which should stay to show the outcome. Every page is dynamic, so others are fresh.
    if (res.decision === 'returned') return { ok: true, message: m.approvals.returned };
    return {
      ok: true,
      message: res.certificateId
        ? fill(m.approvals.issued, { id: res.certificateId })
        : m.approvals.approved,
    };
  } catch (error) {
    const detail =
      error instanceof ApiRequestError
        ? [error.message, ...error.details].join(' ')
        : m.login.unreachable;
    return { ok: false, message: fill(m.approvals.failed, { message: detail }) };
  }
}

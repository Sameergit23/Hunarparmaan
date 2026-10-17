'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiRequestError, apiPost } from '@/lib/api';

export type ReviewState = { error?: string };

export async function reviewFlag(
  flagId: string,
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  try {
    await apiPost(
      `/v1/flags/${z.uuid().parse(flagId)}/review`,
      { note: String(formData.get('note') ?? '').trim() },
      z.unknown(),
    );
    revalidatePath('/flags');
    revalidatePath('/dashboard');
    return {};
  } catch (error) {
    return {
      error:
        error instanceof ApiRequestError
          ? [error.message, ...error.details].join(' ')
          : 'unreachable',
    };
  }
}

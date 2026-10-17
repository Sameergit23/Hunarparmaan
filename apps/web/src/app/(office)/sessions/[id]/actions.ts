'use server';

import { ChainVerification } from '@hunarpramaan/contracts';
import { ApiRequestError, apiGet } from '@/lib/api';

export type ChainState = { result?: ChainVerification; error?: string };

/** Ask the API to re-verify every stored chain that wrote to this session. */
export async function checkChain(sessionId: string): Promise<ChainState> {
  try {
    return { result: await apiGet(`/v1/audit/sessions/${sessionId}/verify`, ChainVerification) };
  } catch (error) {
    return { error: error instanceof ApiRequestError ? error.message : 'unreachable' };
  }
}

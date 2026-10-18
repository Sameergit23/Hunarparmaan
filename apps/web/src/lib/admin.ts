/**
 * Helpers for the admin pages and their server actions (TRD section 7):
 * query strings, reason lists, and errors worded from their codes (rule 7).
 */
import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ADMIN_REASON_CODES, type ReasonedAdminAction } from '@hunarpramaan/contracts';
import type { z } from 'zod';
import type { AdminActionState } from '@/components/confirm-action';
import { ApiRequestError } from './api';
import { getMessages, type Messages } from './i18n';
import { adminErrorText } from './messages';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The page's query, kept only where it fits the API's own query schema, as a
 * string to append to an API path. A hand-edited address never reaches the API.
 */
export function queryFrom<S extends z.ZodObject>(
  schema: S,
  params: Record<string, string | string[] | undefined>,
): { query: Partial<z.infer<S>>; search: string } {
  const query: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = params[key];
    if (typeof value !== 'string' || value === '') continue;
    const one = schema.pick({ [key]: true } as never).safeParse({ [key]: value });
    if (one.success) query[key] = value;
  }
  const search = new URLSearchParams(query).toString();
  return { query: query as Partial<z.infer<S>>, search: search ? `?${search}` : '' };
}

/** The reason codes for an action, worded for the confirmation dialog. */
export function reasonsFor(action: ReasonedAdminAction, m: Messages, only?: readonly string[]) {
  const codes: readonly string[] = ADMIN_REASON_CODES[action];
  return codes
    .filter((code) => code !== 'bootstrap' && (!only || only.includes(code)))
    .map((code) => ({ code, label: m.admin.reasons[code as keyof Messages['admin']['reasons']] }));
}

/**
 * Run an admin write and turn an API refusal into words for the dialog. A
 * redirect (the sign-in ended) still happens.
 */
export async function adminWrite(run: () => Promise<AdminActionState>): Promise<AdminActionState> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);
    const { m, lang } = await getMessages();
    if (error instanceof ApiRequestError) return { error: adminErrorText(error, m, lang) };
    console.error('admin write failed', error);
    return { error: m.admin.errors.unreachable };
  }
}

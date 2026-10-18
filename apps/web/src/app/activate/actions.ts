'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ActivateRequest, LoginResponse } from '@hunarpramaan/contracts';
import { ApiRequestError, apiPost } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { OFFICE_ROLES, TOKEN_COOKIE, homePath } from '@/lib/session';

export type ActivateState = { error?: string; fieldReady?: boolean };

/** An invited person sets their PIN with the one-time code (ADR 010), then is signed in. */
export async function activate(_prev: ActivateState, form: FormData): Promise<ActivateState> {
  const { m } = await getMessages();
  const input = ActivateRequest.safeParse({
    phone: String(form.get('phone') ?? '').replace(/[\s-]/g, ''),
    code: String(form.get('code') ?? ''),
    pin: String(form.get('pin') ?? ''),
    pinAgain: String(form.get('pinAgain') ?? ''),
  });
  if (!input.success) {
    const mismatch = input.error.issues.some((i) => i.path.includes('pinAgain'));
    return { error: mismatch ? m.activate.mismatch : m.activate.invalid };
  }
  let login: LoginResponse;
  try {
    login = await apiPost('/v1/auth/activate', input.data, LoginResponse, { auth: false });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status < 500)
      return { error: m.activate.invalid };
    return { error: m.login.unreachable };
  }
  // Phone roles use the app: their account is ready, but they do not sign in here.
  if (!OFFICE_ROLES.has(login.user.role)) return { fieldReady: true };
  (await cookies()).set(TOKEN_COOKIE, login.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(login.expiresAt),
  });
  redirect(homePath(login.user.role));
}

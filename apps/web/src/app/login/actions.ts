'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginResponse, OtpResponse, Phone } from '@hunarpramaan/contracts';
import { API_URL, ApiRequestError, apiPost } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { OFFICE_ROLES, TOKEN_COOKIE, homePath } from '@/lib/session';

export interface LoginState {
  step: 'phone' | 'code';
  phone: string;
  challengeId?: string;
  mockCode?: string;
  error?: string;
}

/** For the developer's terminal: the page only says the server cannot be reached. */
function logUnreachable(error: unknown) {
  console.error(`Could not reach the API at ${API_URL}. Is it running? (API_URL sets it)`, error);
}

async function requestCode(formData: FormData): Promise<LoginState> {
  const { m } = await getMessages();
  const phone = String(formData.get('phone') ?? '').replace(/[\s-]/g, '');
  if (!Phone.safeParse(phone).success) return { step: 'phone', phone, error: m.login.badPhone };
  try {
    const otp = await apiPost('/v1/auth/otp', { phone }, OtpResponse, { auth: false });
    return {
      step: 'code',
      phone,
      challengeId: otp.challengeId,
      ...(otp.mockCode && { mockCode: otp.mockCode }),
    };
  } catch (error) {
    logUnreachable(error);
    return { step: 'phone', phone, error: m.login.unreachable };
  }
}

async function signIn(prev: LoginState, formData: FormData): Promise<LoginState> {
  const { m } = await getMessages();
  const body = {
    challengeId: prev.challengeId,
    otp: String(formData.get('otp') ?? '').trim(),
    pin: String(formData.get('pin') ?? '').trim(),
  };
  let login: LoginResponse;
  try {
    login = await apiPost('/v1/auth/login', body, LoginResponse, { auth: false });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      const expired = /expired/i.test(error.message);
      return {
        ...prev,
        step: expired ? 'phone' : 'code',
        error: expired ? m.login.expired : m.login.wrong,
      };
    }
    if (error instanceof ApiRequestError && error.status === 400)
      return { ...prev, error: m.login.wrong };
    logUnreachable(error);
    return { ...prev, error: m.login.unreachable };
  }
  if (!OFFICE_ROLES.has(login.user.role))
    return { step: 'phone', phone: prev.phone, error: m.login.fieldOnly };

  (await cookies()).set(TOKEN_COOKIE, login.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(login.expiresAt),
  });
  redirect(homePath(login.user.role));
}

/** One action for both steps: send the code, then sign in with code and PIN. */
export async function loginStep(prev: LoginState, formData: FormData): Promise<LoginState> {
  if (formData.get('intent') === 'restart') return { step: 'phone', phone: prev.phone };
  return prev.step === 'phone' ? requestCode(formData) : signIn(prev, formData);
}

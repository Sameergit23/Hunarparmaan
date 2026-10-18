'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginResponse, OtpResponse, OtpVerifyResponse, Phone } from '@hunarpramaan/contracts';
import { API_URL, ApiRequestError, apiPost } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { signInErrorText } from '@/lib/messages';
import { TICKET_COOKIE, homeFor, keepSignIn } from '@/lib/session';

export interface ResetState {
  /** `ready`: a phone-app account; it signs in on the phone. */
  step: 'phone' | 'code' | 'reset' | 'ready';
  phone: string;
  challengeId?: string;
  mockCode?: string;
  error?: string;
}

/** The ticket lives 10 minutes in the API; the cookie no longer, and only on this page. */
const TICKET_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/reset-pin',
  maxAge: 10 * 60,
};

function logUnreachable(error: unknown) {
  console.error(`Could not reach the API at ${API_URL}. Is it running? (API_URL sets it)`, error);
}

async function requestCode(formData: FormData): Promise<ResetState> {
  const { m, lang } = await getMessages();
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
    const worded = error instanceof ApiRequestError ? signInErrorText(error, m, lang) : null;
    if (worded) return { step: 'phone', phone, error: worded };
    logUnreachable(error);
    return { step: 'phone', phone, error: m.login.unreachable };
  }
}

/** The SMS code alone; only then does the API say whether the number has an account. */
async function checkCode(prev: ResetState, formData: FormData): Promise<ResetState> {
  const { m } = await getMessages();
  const otp = String(formData.get('otp') ?? '').trim();
  let verified: OtpVerifyResponse;
  try {
    verified = await apiPost(
      '/v1/auth/otp/verify',
      { challengeId: prev.challengeId, otp },
      OtpVerifyResponse,
      { auth: false },
    );
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 400)) {
      const expired = /expired/i.test(error.message);
      return {
        ...prev,
        step: expired ? 'phone' : 'code',
        error: expired ? m.login.expired : m.invite.wrongCode,
      };
    }
    logUnreachable(error);
    return { ...prev, error: m.login.unreachable };
  }
  if (verified.account !== 'existing') {
    return { step: 'phone', phone: prev.phone, error: m.resetPin.none };
  }
  (await cookies()).set(TICKET_COOKIE, verified.ticket, TICKET_COOKIE_OPTIONS);
  return { step: 'reset', phone: prev.phone };
}

/** The reset code from the admin and a new PIN, typed twice (FR-26). */
async function reset(prev: ResetState, formData: FormData): Promise<ResetState> {
  const { m, lang } = await getMessages();
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  const newPin = String(formData.get('pin') ?? '').trim();
  if (newPin !== String(formData.get('repeat') ?? '').trim()) {
    return { ...prev, error: m.pin.differ };
  }
  const jar = await cookies();
  const ticket = jar.get(TICKET_COOKIE)?.value;
  if (!ticket) return { step: 'phone', phone: prev.phone, error: m.login.expired };

  let login: LoginResponse;
  try {
    login = await apiPost('/v1/auth/pin-reset/accept', { ticket, code, newPin }, LoginResponse, {
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.code === 'invite_invalid' || error.status === 400) {
        const worded = error.code === 'pin_rejected' ? signInErrorText(error, m, lang) : null;
        return { ...prev, error: worded ?? m.resetPin.invalid };
      }
      const worded = signInErrorText(error, m, lang);
      if (worded) return { ...prev, error: worded };
      if (error.status === 401) {
        jar.delete({ name: TICKET_COOKIE, path: TICKET_COOKIE_OPTIONS.path });
        return { step: 'phone', phone: prev.phone, error: m.login.expired };
      }
    }
    logUnreachable(error);
    return { ...prev, error: m.login.unreachable };
  }
  jar.delete({ name: TICKET_COOKIE, path: TICKET_COOKIE_OPTIONS.path });
  const home = homeFor(login.user.role);
  if (!home) return { step: 'ready', phone: prev.phone };
  await keepSignIn(login);
  redirect(home);
}

/** One action for every step: phone, SMS code, then the reset code and a new PIN. */
export async function resetStep(prev: ResetState, formData: FormData): Promise<ResetState> {
  if (formData.get('intent') === 'restart') return { step: 'phone', phone: prev.phone };
  switch (prev.step) {
    case 'phone':
      return requestCode(formData);
    case 'code':
      return checkCode(prev, formData);
    case 'reset':
      return reset(prev, formData);
    case 'ready':
      return prev;
  }
}

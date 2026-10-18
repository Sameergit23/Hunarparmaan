'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginResponse, OtpResponse, OtpVerifyResponse, Phone } from '@hunarpramaan/contracts';
import { API_URL, ApiRequestError, apiPost } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { signInErrorText } from '@/lib/messages';
import { TICKET_COOKIE, homeFor, keepSignIn } from '@/lib/session';

export interface InviteState {
  /** `ready`: a phone-app account was set up here; it signs in on the phone. */
  step: 'phone' | 'code' | 'accept' | 'ready';
  phone: string;
  challengeId?: string;
  mockCode?: string;
  error?: string;
}

/** The ticket lives 10 minutes in the API; the cookie no longer. */
const TICKET_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/invite',
  maxAge: 10 * 60,
};

/** For the developer's terminal: the page only says the server cannot be reached. */
function logUnreachable(error: unknown) {
  console.error(`Could not reach the API at ${API_URL}. Is it running? (API_URL sets it)`, error);
}

async function requestCode(formData: FormData): Promise<InviteState> {
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

/** The SMS code alone. Only once it is right does the API say whether an invite is waiting. */
async function checkCode(prev: InviteState, formData: FormData): Promise<InviteState> {
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
  if (verified.account !== 'invited') {
    const error = verified.account === 'existing' ? m.invite.existing : m.invite.none;
    return { step: 'phone', phone: prev.phone, error };
  }
  (await cookies()).set(TICKET_COOKIE, verified.ticket, TICKET_COOKIE_OPTIONS);
  return { step: 'accept', phone: prev.phone };
}

/** The invite code and a new PIN, typed twice. */
async function accept(prev: InviteState, formData: FormData): Promise<InviteState> {
  const { m, lang } = await getMessages();
  const inviteCode = String(formData.get('inviteCode') ?? '').replace(/\s/g, '');
  const pin = String(formData.get('pin') ?? '').trim();
  if (pin !== String(formData.get('repeat') ?? '').trim()) return { ...prev, error: m.pin.differ };
  const jar = await cookies();
  const ticket = jar.get(TICKET_COOKIE)?.value;
  if (!ticket) return { step: 'phone', phone: prev.phone, error: m.login.expired };

  let login: LoginResponse;
  try {
    login = await apiPost('/v1/auth/invite/accept', { ticket, inviteCode, pin }, LoginResponse, {
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const worded = signInErrorText(error, m, lang);
      if (worded) return { ...prev, error: worded };
      if (error.status === 401) {
        jar.delete({ name: TICKET_COOKIE, path: TICKET_COOKIE_OPTIONS.path });
        return { step: 'phone', phone: prev.phone, error: m.login.expired };
      }
      // The form's own checks failed, such as an invite code that isn't 8 digits.
      if (error.status === 400) return { ...prev, error: m.invite.invalid };
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

/** One action for every step: phone, SMS code, then the invite code and a new PIN. */
export async function inviteStep(prev: InviteState, formData: FormData): Promise<InviteState> {
  if (formData.get('intent') === 'restart') return { step: 'phone', phone: prev.phone };
  switch (prev.step) {
    case 'phone':
      return requestCode(formData);
    case 'code':
      return checkCode(prev, formData);
    case 'accept':
      return accept(prev, formData);
    case 'ready':
      return prev;
  }
}

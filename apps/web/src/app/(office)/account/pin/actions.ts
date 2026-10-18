'use server';

import { LoginResponse } from '@hunarpramaan/contracts';
import { ApiRequestError, apiPost } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { signInErrorText } from '@/lib/messages';
import { keepSignIn } from '@/lib/session';

export interface PinState {
  ok?: boolean;
  error?: string;
}

/** Change the PIN. The API ends every other sign-in and returns a fresh token for this one. */
export async function changePin(_prev: PinState, formData: FormData): Promise<PinState> {
  const { m, lang } = await getMessages();
  const currentPin = String(formData.get('currentPin') ?? '').trim();
  const newPin = String(formData.get('newPin') ?? '').trim();
  if (newPin !== String(formData.get('repeat') ?? '').trim()) return { error: m.pin.differ };
  try {
    const login = await apiPost('/v1/auth/pin', { currentPin, newPin }, LoginResponse);
    // A new token, not a new sign-in: "Last sign-in" stays as it is.
    await keepSignIn(login, { rememberLast: false });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error;
    const worded = signInErrorText(error, m, lang);
    if (worded) return { error: worded };
    // The API refused the form itself, such as a current PIN that isn't 4 to 6 digits.
    if (error.status === 400) return { error: m.account.wrong };
    throw error;
  }
}

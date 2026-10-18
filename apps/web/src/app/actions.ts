'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LANG_COOKIE } from '@/lib/i18n';
import { LAST_SIGN_IN_COOKIE, TOKEN_COOKIE } from '@/lib/session';

const YEAR_S = 365 * 24 * 3600;

/** Switch between English and Hindi, and stay on the same page. */
export async function switchLanguage(formData: FormData) {
  const lang = formData.get('lang') === 'hi' ? 'hi' : 'en';
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: YEAR_S, sameSite: 'lax' });
  const back = String(formData.get('back') ?? '/');
  redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/');
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  jar.delete(LAST_SIGN_IN_COOKIE);
  redirect('/');
}

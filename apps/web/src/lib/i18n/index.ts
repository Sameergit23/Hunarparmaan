import { cookies } from 'next/headers';
import { en, type Messages } from './en';
import { hi } from './hi';

export type Lang = 'en' | 'hi';
export const LANG_COOKIE = 'hp_lang';

export const dictionaries: Record<Lang, Messages> = { en, hi };

/** The viewer's language; office screens are English first (Wire code "Copy"). */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return value === 'hi' ? 'hi' : 'en';
}

export async function getMessages() {
  const lang = await getLang();
  return { lang, m: dictionaries[lang] };
}

export { fill } from './fill';

export type { Messages };

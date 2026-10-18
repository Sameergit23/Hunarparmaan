/**
 * Which language a screen speaks. Pure, so it is tested without React Native.
 *
 * Rule (docs/design/mobile-app.md): a language the person chose on the
 * landing screen wins everywhere; until they choose, worker screens speak
 * Hindi and staff screens (mobiliser, assessor) speak English.
 */
import type { Language } from '@hunarpramaan/contracts';
import type { Audience } from '../theme';

export type Lang = Language;
export const LANGS: readonly Lang[] = ['hi', 'en'];

/** The default language for each audience, used until the person chooses. */
export const DEFAULT_LANG: Readonly<Record<Audience, Lang>> = { worker: 'hi', staff: 'en' };

export function resolveLang(choice: Lang | null, audience: Audience): Lang {
  return choice ?? DEFAULT_LANG[audience];
}

/** A stored value back to a language, or null when it is missing or unknown. */
export function parseLang(value: unknown): Lang | null {
  return value === 'hi' || value === 'en' ? value : null;
}

/** BCP 47 tag for text to speech: Indian Hindi or Indian English. */
export function speechLocale(lang: Lang): 'hi-IN' | 'en-IN' {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

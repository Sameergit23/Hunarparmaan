/**
 * Language for the whole app. The person's explicit choice (from the landing
 * screen) is kept and wins; without one, each screen uses its audience's
 * default (`resolveLang`). `Screen` sets the audience for everything inside it.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Audience } from '../theme';
import { en, type Messages } from './en';
import { fill } from './fill';
import { hi } from './hi';
import { resolveLang, speechLocale, type Lang } from './resolve';

export const dictionaries: Readonly<Record<Lang, Messages>> = { en, hi };

interface LanguageState {
  choice: Lang | null;
  choose: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageState>({ choice: null, choose: () => undefined });
const AudienceContext = createContext<Audience>('worker');

export function I18nProvider({
  initialChoice = null,
  onChoose,
  children,
}: {
  /** The choice saved on the phone, if any. */
  initialChoice?: Lang | null;
  /** Called when the person picks a language, to save it. */
  onChoose?: (lang: Lang) => void;
  children: ReactNode;
}) {
  const [choice, setChoice] = useState<Lang | null>(initialChoice);
  const choose = useCallback(
    (lang: Lang) => {
      setChoice(lang);
      onChoose?.(lang);
    },
    [onChoose],
  );
  const value = useMemo(() => ({ choice, choose }), [choice, choose]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Sets who a screen is for: worker screens are Hindi first, staff screens English first. */
export function AudienceProvider({
  audience,
  children,
}: {
  audience: Audience;
  children: ReactNode;
}) {
  return <AudienceContext.Provider value={audience}>{children}</AudienceContext.Provider>;
}

export function useAudience(): Audience {
  return useContext(AudienceContext);
}

export interface I18n {
  /** The language this screen speaks. */
  lang: Lang;
  /** The strings in that language. */
  m: Messages;
  /** The person's explicit choice, or null before they choose. */
  choice: Lang | null;
  /** Save an explicit choice; it then wins on every screen. */
  setLang: (lang: Lang) => void;
  /** Fill `{name}` placeholders. */
  fill: typeof fill;
  /** `hi-IN` or `en-IN`, for text to speech. */
  speechLocale: 'hi-IN' | 'en-IN';
  audience: Audience;
}

/**
 * Strings for the current screen. Pass `audience` only outside a `Screen`
 * (or to override it); inside one, the screen's audience is used.
 */
export function useI18n(audience?: Audience): I18n {
  const { choice, choose } = useContext(LanguageContext);
  const screenAudience = useContext(AudienceContext);
  const who = audience ?? screenAudience;
  const lang = resolveLang(choice, who);
  return useMemo(
    () => ({
      lang,
      m: dictionaries[lang],
      choice,
      setLang: choose,
      fill,
      speechLocale: speechLocale(lang),
      audience: who,
    }),
    [lang, choice, choose, who],
  );
}

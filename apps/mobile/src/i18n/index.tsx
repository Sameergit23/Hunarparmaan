import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Language } from '@hunarpramaan/contracts';
import { en, type Messages } from './en';
import { hi } from './hi';

export const dictionaries: Record<Language, Messages> = { en, hi };

/** Fill `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

interface I18n {
  lang: Language;
  m: Messages;
  setLang: (lang: Language) => void;
}

const I18nContext = createContext<I18n | null>(null);

/** Worker screens are Hindi first (Wire code "Copy"), so the app starts in Hindi. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('hi');
  const value = useMemo(() => ({ lang, m: dictionaries[lang], setLang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export type { Messages };

import type { Lang } from './i18n';

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

/** 0.783 → "78%". */
export function percent(value: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function decimal(value: number, lang: Lang, digits = 2): string {
  return new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** Dates in Indian time: "24 Nov 2026". */
export function date(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

export function dateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

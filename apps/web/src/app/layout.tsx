import type { Metadata, Viewport } from 'next';
import { Hind, Rajdhani } from 'next/font/google';
import type { CSSProperties, ReactNode } from 'react';
import { getMessages } from '@/lib/i18n';
import { color } from '@/theme/tokens';
import './globals.css';

// Both cover Devanagari (Wire code "Type").
const rajdhani = Rajdhani({
  subsets: ['latin', 'devanagari'],
  weight: ['600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
});
const hind = Hind({
  subsets: ['latin', 'devanagari'],
  weight: ['400', '500', '600'],
  variable: '--font-hind',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'HunarPramaan', template: '%s | HunarPramaan' },
  description: 'Recognition of Prior Learning, assisted by AI and decided by people.',
};

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1 };

/** `--color-<token>` for CSS that cannot use a class (globals.css, arbitrary values). */
const colorVariables = Object.fromEntries(
  Object.entries(color).map(([name, value]) => [`--color-${name}`, value]),
) as CSSProperties;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang } = await getMessages();
  return (
    <html lang={lang} className={`${rajdhani.variable} ${hind.variable}`} style={colorVariables}>
      <body className="bg-ground font-body text-ink antialiased">{children}</body>
    </html>
  );
}

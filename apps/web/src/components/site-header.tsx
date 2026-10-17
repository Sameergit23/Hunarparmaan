import Link from 'next/link';
import { LogIn } from 'lucide-react';
import type { Lang, Messages } from '@/lib/i18n';
import { LanguageSwitch } from './language-switch';
import { BrandStripe, ButtonLink, LogoTile } from './wire';

/** Public header: stripe, logo and name in both scripts, language, sign in. */
export function SiteHeader({ m, lang, path }: { m: Messages; lang: Lang; path: string }) {
  return (
    <header>
      <BrandStripe />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-[18px] py-3">
        <Link href="/" className="flex items-center gap-3 no-underline hover:text-ink">
          <LogoTile size={48} />
          <span className="flex flex-col leading-none">
            <span className="font-heading text-[26px] font-bold">{m.brand}</span>
            <span className="text-[15px] text-ink2">{m.brandOther}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitch lang={lang} m={m} back={path} />
          <ButtonLink href="/login" icon={LogIn}>
            {m.signIn}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ m }: { m: Messages }) {
  return (
    <footer className="mt-12 border-t-[1.5px] border-line">
      <div className="mx-auto max-w-6xl px-[18px] py-6 text-sm text-ink2">{m.landing.footer}</div>
    </footer>
  );
}

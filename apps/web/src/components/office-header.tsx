import Link from 'next/link';
import { LogOut } from 'lucide-react';
import type { Role } from '@hunarpramaan/contracts';
import { signOut } from '@/app/actions';
import type { Lang, Messages } from '@/lib/i18n';
import { Icon } from './icon';
import { LanguageSwitch } from './language-switch';
import { BrandStripe, LogoTile, cx } from './wire';

export type NavKey = 'dashboard' | 'declarations' | 'sessions' | 'approvals' | 'flags';

/** Which pages each office role sees, matching READ_ACCESS in the contracts. */
export const NAV_BY_ROLE: Record<string, NavKey[]> = {
  agency: ['dashboard', 'declarations', 'sessions', 'flags'],
  awarding_body: ['dashboard', 'approvals', 'declarations', 'sessions'],
  ncvet: ['dashboard'],
};

/**
 * Brand stripe, then a black bar. The active item is plate with a 3px line;
 * the others are navOff (Wire code "Bottom nav", used here at the top).
 */
export function OfficeHeader({
  m,
  lang,
  user,
  active,
  path,
}: {
  m: Messages;
  lang: Lang;
  user: { name: string; role: Role };
  active: NavKey;
  path: string;
}) {
  const items = NAV_BY_ROLE[user.role] ?? [];
  return (
    <header>
      <BrandStripe />
      <div className="bg-ink text-plate">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-[18px]">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 py-2 text-plate no-underline hover:text-plate"
          >
            <LogoTile size={40} />
            <span className="font-heading text-[22px] font-bold">{m.brand}</span>
          </Link>
          <nav
            aria-label={m.nav.label}
            className="order-last -mx-[18px] flex w-full overflow-x-auto sm:order-none sm:mx-0 sm:w-auto"
          >
            {items.map((key) => (
              <Link
                key={key}
                href={`/${key}`}
                aria-current={active === key ? 'page' : undefined}
                className={cx(
                  'flex min-h-[56px] items-center px-4 text-[16px] no-underline focus-visible:outline-plate',
                  active === key
                    ? 'font-semibold text-plate shadow-[inset_0_3px_0_var(--color-plate)] hover:text-plate'
                    : 'text-navOff hover:text-plate',
                )}
              >
                {m.nav[key]}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 py-2">
            <span className="hidden flex-col text-right leading-tight sm:flex">
              <span className="text-[15px] font-semibold">{user.name}</span>
              <span className="text-sm text-navOff">{m.roles[user.role]}</span>
            </span>
            <LanguageSwitch lang={lang} m={m} back={path} onDark />
            <form action={signOut}>
              <button
                type="submit"
                aria-label={m.signOut}
                className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-card border-2 border-plate text-plate"
              >
                <Icon as={LogOut} size={20} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}

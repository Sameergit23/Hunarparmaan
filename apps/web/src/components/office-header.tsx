import Link from 'next/link';
import { KeyRound, LogOut } from 'lucide-react';
import type { Role } from '@hunarpramaan/contracts';
import { signOut } from '@/app/actions';
import { dateTime } from '@/lib/format';
import { fill, type Lang, type Messages } from '@/lib/i18n';
import { Icon } from './icon';
import { LanguageSwitch } from './language-switch';
import { BrandStripe, LogoTile, cx } from './wire';

export type NavKey = 'dashboard' | 'sessions' | 'approvals' | 'flags' | 'governance';

/** Which pages each office role sees, matching READ_ACCESS in the contracts. */
export const NAV_BY_ROLE: Record<string, NavKey[]> = {
  agency: ['dashboard', 'sessions', 'flags'],
  awarding_body: ['dashboard', 'approvals', 'sessions'],
  ncvet: ['dashboard', 'governance'],
};

export interface NavItem {
  key: string;
  href: string;
  label: string;
}

/**
 * Brand stripe, then a black bar. The active item is plate with a 3px line;
 * the others are navOff (Wire code "Bottom nav", used here at the top). Office
 * and admin screens share it; admin screens also show the organisation, so an
 * admin always knows whose people they are looking at.
 */
export function AppHeader({
  m,
  lang,
  user,
  items,
  active,
  home,
  path,
  lastSignIn,
  organisation,
}: {
  m: Messages;
  lang: Lang;
  user: { name: string; role: Role };
  items: NavItem[];
  active?: string | undefined;
  home: string;
  path: string;
  /** The sign-in before this one, or null on someone's first. */
  lastSignIn: string | null;
  organisation?: string | undefined;
}) {
  return (
    <header>
      <BrandStripe />
      <div className="bg-ink text-plate">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-[18px]">
          <Link
            href={home}
            className="flex items-center gap-3 py-2 text-plate no-underline hover:text-plate"
          >
            <LogoTile size={40} />
            <span className="font-heading text-[22px] font-bold">{m.brand}</span>
          </Link>
          <nav
            aria-label={m.nav.label}
            className="order-last -mx-[18px] flex w-full overflow-x-auto sm:order-none sm:mx-0 sm:w-auto"
          >
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? 'page' : undefined}
                className={cx(
                  'flex min-h-[56px] items-center px-4 text-[16px] no-underline focus-visible:outline-plate',
                  active === item.key
                    ? 'font-semibold text-plate shadow-[inset_0_3px_0_var(--color-plate)] hover:text-plate'
                    : 'text-navOff hover:text-plate',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 py-2">
            <span className="hidden flex-col text-right leading-tight sm:flex">
              <span className="text-[15px] font-semibold">{user.name}</span>
              <span className="text-sm text-navOff">{m.roles[user.role]}</span>
              {organisation && <span className="text-sm text-navOff">{organisation}</span>}
              <span className="text-sm text-navOff">
                {lastSignIn
                  ? fill(m.account.lastSignIn, { time: dateTime(lastSignIn, lang) })
                  : m.account.firstSignIn}
              </span>
            </span>
            <LanguageSwitch lang={lang} m={m} back={path} onDark />
            <Link
              href="/account/pin"
              aria-label={m.account.changePin}
              title={m.account.changePin}
              className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-card border-2 border-plate text-plate no-underline hover:text-plate focus-visible:outline-plate"
            >
              <Icon as={KeyRound} size={20} />
            </Link>
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

/** The office header: the role's pages from NAV_BY_ROLE. */
export function OfficeHeader({
  m,
  active,
  user,
  ...props
}: Omit<Parameters<typeof AppHeader>[0], 'items' | 'home'> & { active?: NavKey | undefined }) {
  const items = (NAV_BY_ROLE[user.role] ?? []).map((key) => ({
    key,
    href: `/${key}`,
    label: m.nav[key],
  }));
  return <AppHeader m={m} user={user} items={items} active={active} home="/dashboard" {...props} />;
}

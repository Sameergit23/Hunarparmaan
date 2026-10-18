import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { getMessages, type Lang, type Messages } from '@/lib/i18n';
import { OFFICE_ROLES, requireUser } from '@/lib/session';
import { Icon } from './icon';
import { NAV_BY_ROLE, OfficeHeader, type NavKey } from './office-header';

/**
 * Frame for every signed-in page: header, nav, and a role check. The API
 * checks roles again on every request; this only keeps people off pages
 * that would fail for them.
 */
export async function OfficeShell({
  active,
  path,
  children,
}: {
  active: NavKey;
  path: string;
  children: (ctx: {
    m: Messages;
    lang: Lang;
    user: Awaited<ReturnType<typeof requireUser>>;
  }) => ReactNode;
}) {
  const user = await requireUser();
  const { m, lang } = await getMessages();
  const allowed = OFFICE_ROLES.has(user.role) && (NAV_BY_ROLE[user.role] ?? []).includes(active);
  return (
    <>
      <OfficeHeader m={m} lang={lang} user={user} active={active} path={path} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-[18px] py-6">
        {allowed ? (
          children({ m, lang, user })
        ) : (
          <p
            role="alert"
            className="m-0 flex items-center gap-2 rounded-card border-2 border-phaseRed bg-plate p-4 font-semibold"
          >
            <Icon as={ShieldAlert} className="text-phaseRed" />
            {m.errors.forbidden}
          </p>
        )}
      </main>
    </>
  );
}

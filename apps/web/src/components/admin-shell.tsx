import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { OrganisationView } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { apiGet } from '@/lib/api';
import { getMessages, type Lang, type Messages } from '@/lib/i18n';
import { homeFor, isAdminRole, lastSignIn, requireUser } from '@/lib/session';
import { Icon } from './icon';
import { AppHeader, OfficeHeader } from './office-header';
import { ButtonLink } from './wire';

export type AdminNavKey = 'people' | 'devices' | 'audit';
const ADMIN_NAV: AdminNavKey[] = ['people', 'devices', 'audit'];

/** Shown when an account opens a page that isn't for its role. The API refuses the data anyway. */
export function NotYourPage({ m, home }: { m: Messages; home: string | null }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p
        role="alert"
        className="m-0 flex items-center gap-2 rounded-card border-2 border-phaseRed bg-plate p-4 font-semibold"
      >
        <Icon as={ShieldAlert} className="text-phaseRed" />
        {m.admin.notYourPage}
      </p>
      <ButtonLink href={home ?? '/'}>{m.admin.goHome}</ButtonLink>
    </div>
  );
}

export interface AdminContext {
  m: Messages;
  lang: Lang;
  user: Awaited<ReturnType<typeof requireUser>>;
  /** Every organisation for the platform admin; their own for everyone else. */
  organisations: OrganisationView[];
  /** The admin's own organisation's name, in the viewer's language. */
  orgName: string;
}

/**
 * Frame for every admin page (TRD section 7.2): header with the admin nav and
 * the organisation, and a role check. Admin accounts never see the office
 * screens, and office accounts never see these (ADR 010: nobody who decides
 * administers). The API checks again on every request.
 */
export async function AdminShell({
  active,
  path,
  children,
}: {
  active?: AdminNavKey;
  path: string;
  children: (ctx: AdminContext) => ReactNode;
}) {
  const user = await requireUser();
  const { m, lang } = await getMessages();
  const last = await lastSignIn();
  if (!isAdminRole(user.role)) {
    return (
      <>
        <OfficeHeader m={m} lang={lang} user={user} path={path} lastSignIn={last} />
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-[18px] py-6">
          <NotYourPage m={m} home={homeFor(user.role)} />
        </main>
      </>
    );
  }
  const organisations = await apiGet('/v1/admin/organisations', z.array(OrganisationView));
  const orgName = organisations.find((o) => o.id === user.organisationId)?.name[lang] ?? '';
  return (
    <>
      <AppHeader
        m={m}
        lang={lang}
        user={user}
        items={ADMIN_NAV.map((key) => ({
          key,
          href: `/admin/${key}`,
          label: m.admin.nav[key],
        }))}
        active={active}
        home="/admin/people"
        path={path}
        lastSignIn={last}
        organisation={orgName}
      />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-[18px] py-6">
        {children({ m, lang, user, organisations, orgName })}
      </main>
    </>
  );
}

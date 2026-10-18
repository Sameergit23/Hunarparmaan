import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import {
  AccountList,
  AccountListQuery,
  AccountStatus,
  InviteList,
  InviteListQuery,
  ROLES_BY_ORG_KIND,
  SCOPE_BY_ROLE,
  type Role,
} from '@hunarpramaan/contracts';
import { AdminShell } from '@/components/admin-shell';
import { AccountStatusChip, InviteStatusChip, LockedChip } from '@/components/admin-status';
import { ButtonLink, Card, Chip, PageTitle, cx } from '@/components/wire';
import { queryFrom, type SearchParams } from '@/lib/admin';
import { apiGet } from '@/lib/api';
import { dateTime, fromNow } from '@/lib/format';
import { fill } from '@/lib/i18n';

export const metadata = { title: 'People' };

const field = 'min-h-touch rounded-card border-2 border-ink bg-plate px-3 text-[16px]';

/** P1 (app flow section 3): accounts and pending invites, with filters and search. */
export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <AdminShell active="people" path="/admin/people">
      {async ({ m, lang, user, organisations, orgName }) => {
        const governance = SCOPE_BY_ROLE[user.role] === 'governance';
        const tab = params.tab === 'invites' ? 'invites' : 'accounts';
        // The platform admin lands on organisation admins (app flow section 2); "all" shows everyone.
        const raw = { ...params };
        if (governance && raw.role === undefined) raw.role = 'admin';
        if (raw.role === 'all') delete raw.role;
        const accounts = queryFrom(AccountListQuery, raw);
        const invites = queryFrom(InviteListQuery, params);
        const pending = await apiGet('/v1/admin/invites?status=pending', InviteList);
        const roles: Role[] = governance
          ? [...new Set(Object.values(ROLES_BY_ORG_KIND).flat())].filter((r) => r !== 'worker')
          : [...ROLES_BY_ORG_KIND[organisations[0]?.kind ?? 'assessment_agency']].filter(
              (r) => r !== 'worker',
            );
        const tabLink = (key: 'accounts' | 'invites', label: string) => (
          <Link
            href={key === 'invites' ? '/admin/people?tab=invites' : '/admin/people'}
            aria-current={tab === key ? 'page' : undefined}
            className={cx(
              'flex min-h-touch items-center rounded-card border-2 border-ink px-4 font-semibold no-underline',
              tab === key
                ? 'bg-ink text-plate hover:text-plate'
                : 'bg-plate text-ink hover:text-ink',
            )}
          >
            {label}
          </Link>
        );
        return (
          <>
            <PageTitle
              title={m.admin.people.title}
              body={
                governance ? m.admin.people.bodyAll : fill(m.admin.people.body, { org: orgName })
              }
            >
              <ButtonLink href="/admin/people/invite" tone="primary" icon={UserPlus}>
                {m.admin.people.invite}
              </ButtonLink>
            </PageTitle>
            <nav aria-label={m.admin.people.title} className="flex flex-wrap gap-2">
              {tabLink('accounts', m.admin.people.accounts)}
              {tabLink(
                'invites',
                `${m.admin.people.invites} (${fill(m.admin.people.pendingCount, { n: pending.items.length })})`,
              )}
            </nav>

            {tab === 'accounts' ? (
              <>
                <form method="get" className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1 text-sm font-semibold">
                    <label htmlFor="filter-role">{m.admin.people.role}</label>
                    <select
                      id="filter-role"
                      name="role"
                      defaultValue={accounts.query.role ?? 'all'}
                      className={field}
                    >
                      <option value="all">{m.admin.people.allRoles}</option>
                      <option value="admin">{m.admin.people.admins}</option>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {m.roles[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 text-sm font-semibold">
                    <label htmlFor="filter-status">{m.admin.people.statusLabel}</label>
                    <select
                      id="filter-status"
                      name="status"
                      defaultValue={accounts.query.status ?? ''}
                      className={field}
                    >
                      <option value="">{m.admin.people.allStatuses}</option>
                      {AccountStatus.options.map((s) => (
                        <option key={s} value={s}>
                          {m.admin.status[s]}
                        </option>
                      ))}
                      <option value="locked">{m.admin.status.locked}</option>
                    </select>
                  </div>
                  {governance && (
                    <div className="flex flex-col gap-1 text-sm font-semibold">
                      <label htmlFor="filter-organisation">{m.admin.people.organisation}</label>
                      <select
                        id="filter-organisation"
                        name="organisationId"
                        defaultValue={accounts.query.organisationId ?? ''}
                        className={field}
                      >
                        <option value="">{m.admin.people.allOrganisations}</option>
                        {organisations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name[lang]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
                    <label htmlFor="filter-q">{m.admin.people.search}</label>
                    <input
                      id="filter-q"
                      name="q"
                      type="search"
                      defaultValue={accounts.query.q ?? ''}
                      className={cx(field, 'w-full min-w-[12rem]')}
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-touch rounded-card border-2 border-ink bg-plate px-4 font-semibold"
                  >
                    {m.admin.apply}
                  </button>
                </form>
                {await accountRows(accounts.search)}
              </>
            ) : (
              await inviteRows(invites.search)
            )}
          </>
        );

        async function accountRows(search: string) {
          const list = await apiGet(`/v1/admin/accounts${search}`, AccountList);
          if (list.items.length === 0) {
            return (
              <Card>
                <p className="m-0 text-ink2">
                  {search ? m.admin.people.noMatch : m.admin.people.empty}
                </p>
              </Card>
            );
          }
          return (
            <>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {list.items.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/admin/people/${a.id}`}
                      className="grid gap-2 rounded-card border-[1.5px] border-line bg-plate p-4 no-underline hover:border-ink hover:text-ink md:grid-cols-[1.5fr_1.2fr_1.3fr_auto] md:items-center"
                    >
                      <span className="flex flex-col">
                        <span className="text-[18px] font-semibold">{a.name}</span>
                        <span className="text-sm text-ink2">{a.phone}</span>
                      </span>
                      <span className="flex flex-col">
                        <span className="text-[15px]">{m.roles[a.role]}</span>
                        {governance && (
                          <span className="text-sm text-ink2">{a.organisationName[lang]}</span>
                        )}
                      </span>
                      <span className="flex flex-col text-sm">
                        <span>
                          {m.admin.people.lastSignIn}:{' '}
                          {a.lastSignInAt ? dateTime(a.lastSignInAt, lang) : m.admin.never}
                        </span>
                        <span>
                          {m.admin.people.lastSync}:{' '}
                          {a.lastSyncAt ? dateTime(a.lastSyncAt, lang) : m.admin.never}
                        </span>
                        {a.clipsWaiting > 0 && (
                          <span className="font-semibold">
                            {fill(m.admin.people.waiting, { n: a.clipsWaiting })}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 md:justify-end">
                        <AccountStatusChip status={a.status} m={m} />
                        {a.locked && <LockedChip m={m} />}
                        {governance && !a.actionable && a.id !== user.id && (
                          <Chip tone="neutral">{m.admin.people.viewOnly}</Chip>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {list.nextCursor && (
                <NextPage search={search} cursor={list.nextCursor} label={m.admin.nextPage} />
              )}
            </>
          );
        }

        async function inviteRows(search: string) {
          const list = await apiGet(`/v1/admin/invites${search}`, InviteList);
          if (list.items.length === 0) {
            return (
              <Card>
                <p className="m-0 text-ink2">{m.admin.people.noInvites}</p>
              </Card>
            );
          }
          return (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {list.items.map((i) => (
                <li
                  key={i.id}
                  className="grid gap-2 rounded-card border-[1.5px] border-line bg-plate p-4 md:grid-cols-[1.5fr_1.2fr_1.3fr_auto] md:items-center"
                >
                  <span className="flex flex-col">
                    <span className="text-[18px] font-semibold">{i.name}</span>
                    <span className="text-sm text-ink2">{i.phone}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[15px]">{m.roles[i.role]}</span>
                    {governance && (
                      <span className="text-sm text-ink2">{i.organisationName[lang]}</span>
                    )}
                  </span>
                  <span className="flex flex-col text-sm">
                    <span>
                      {i.invitedBy
                        ? fill(m.admin.people.invitedBy, { name: i.invitedBy })
                        : m.admin.people.bootstrapInvite}
                    </span>
                    {(i.status === 'pending' || i.status === 'expired') && (
                      <span>
                        {fill(
                          i.status === 'pending'
                            ? m.admin.people.expiresIn
                            : m.admin.people.expiredOn,
                          { time: fromNow(i.expiresAt, lang) },
                        )}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 md:justify-end">
                    <InviteStatusChip status={i.status} m={m} />
                    {i.status === 'expired' && (
                      <Link
                        href={`/admin/people/invite?${new URLSearchParams({ name: i.name, role: i.role })}`}
                        className="text-[15px] font-semibold"
                      >
                        {m.admin.people.inviteAgain}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          );
        }
      }}
    </AdminShell>
  );
}

function NextPage({ search, cursor, label }: { search: string; cursor: string; label: string }) {
  const next = new URLSearchParams(search.replace(/^\?/, ''));
  next.set('cursor', cursor);
  return (
    <ButtonLink href={`?${next}`} className="self-start">
      {label}
    </ButtonLink>
  );
}

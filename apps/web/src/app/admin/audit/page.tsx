import {
  ADMIN_ACTION_TYPES,
  AdminLog,
  AdminLogQuery,
  SCOPE_BY_ROLE,
} from '@hunarpramaan/contracts';
import { AdminShell } from '@/components/admin-shell';
import { AuditRows } from '@/components/audit-rows';
import { VerifyChain } from '@/components/verify-chain';
import { ButtonLink, Card, PageTitle } from '@/components/wire';
import { queryFrom, type SearchParams } from '@/lib/admin';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Audit log' };

const field = 'min-h-touch rounded-card border-2 border-ink bg-plate px-3 text-[16px]';

/** A1 (app flow section 3): every admin action in scope, newest first, and "Verify chain". */
export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <AdminShell active="audit" path="/admin/audit">
      {async ({ m, lang, user }) => {
        const governance = SCOPE_BY_ROLE[user.role] === 'governance';
        const { query, search } = queryFrom(AdminLogQuery, params);
        const log = await apiGet(`/v1/admin/log${search}`, AdminLog);
        const next = new URLSearchParams(search.replace(/^\?/, ''));
        if (log.nextCursor) next.set('cursor', log.nextCursor);
        return (
          <>
            <PageTitle
              title={m.admin.audit.title}
              body={governance ? m.admin.audit.bodyAll : m.admin.audit.body}
            />
            <VerifyChain labels={m.admin.audit} />
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 text-sm font-semibold">
                <label htmlFor="filter-type">{m.admin.audit.type}</label>
                <select
                  id="filter-type"
                  name="type"
                  defaultValue={query.type ?? ''}
                  className={field}
                >
                  <option value="">{m.admin.audit.allTypes}</option>
                  {ADMIN_ACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {m.admin.types[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 text-sm font-semibold">
                <label htmlFor="filter-from">{m.admin.audit.from}</label>
                <input
                  type="date"
                  id="filter-from"
                  name="from"
                  defaultValue={query.from ?? ''}
                  className={field}
                />
              </div>
              <div className="flex flex-col gap-1 text-sm font-semibold">
                <label htmlFor="filter-to">{m.admin.audit.to}</label>
                <input
                  type="date"
                  id="filter-to"
                  name="to"
                  defaultValue={query.to ?? ''}
                  className={field}
                />
              </div>
              <button
                type="submit"
                className="min-h-touch rounded-card border-2 border-ink bg-plate px-4 font-semibold"
              >
                {m.admin.apply}
              </button>
            </form>
            {log.items.length === 0 ? (
              <Card>
                <p className="m-0 text-ink2">
                  {search ? m.admin.audit.noMatch : m.admin.audit.empty}
                </p>
              </Card>
            ) : (
              <AuditRows entries={log.items} m={m} lang={lang} showOrganisation={governance} />
            )}
            {log.nextCursor && (
              <ButtonLink href={`?${next}`} className="self-start">
                {m.admin.nextPage}
              </ButtonLink>
            )}
          </>
        );
      }}
    </AdminShell>
  );
}

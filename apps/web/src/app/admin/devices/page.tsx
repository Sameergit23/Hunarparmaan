import Link from 'next/link';
import { DeviceList, DeviceListQuery, DeviceStatus, SCOPE_BY_ROLE } from '@hunarpramaan/contracts';
import { AdminShell } from '@/components/admin-shell';
import { DeviceStatusChip } from '@/components/admin-status';
import { ButtonLink, Card, PageTitle } from '@/components/wire';
import { queryFrom, type SearchParams } from '@/lib/admin';
import { apiGet } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { fill } from '@/lib/i18n';

export const metadata = { title: 'Devices' };

const field = 'min-h-touch rounded-card border-2 border-ink bg-plate px-3 text-[16px]';

/** D1 (app flow section 3): the organisation's phones, with status and last sync. */
export default async function DevicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <AdminShell active="devices" path="/admin/devices">
      {async ({ m, lang, user, orgName }) => {
        const governance = SCOPE_BY_ROLE[user.role] === 'governance';
        const { query, search } = queryFrom(DeviceListQuery, params);
        const list = await apiGet(`/v1/admin/devices${search}`, DeviceList);
        const next = new URLSearchParams(search.replace(/^\?/, ''));
        if (list.nextCursor) next.set('cursor', list.nextCursor);
        return (
          <>
            <PageTitle
              title={m.admin.devices.title}
              body={
                governance ? m.admin.devices.bodyAll : fill(m.admin.devices.body, { org: orgName })
              }
            />
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 text-sm font-semibold">
                <label htmlFor="filter-status">{m.admin.devices.statusLabel}</label>
                <select
                  id="filter-status"
                  name="status"
                  defaultValue={query.status ?? ''}
                  className={field}
                >
                  <option value="">{m.admin.devices.allStatuses}</option>
                  {DeviceStatus.options.map((s) => (
                    <option key={s} value={s}>
                      {m.admin.deviceStatus[s]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-touch items-center gap-2 text-[15px] font-semibold">
                <input
                  type="checkbox"
                  name="stale"
                  value="true"
                  defaultChecked={query.stale === 'true'}
                  className="size-5 accent-ink"
                />
                {m.admin.devices.stale}
              </label>
              <button
                type="submit"
                className="min-h-touch rounded-card border-2 border-ink bg-plate px-4 font-semibold"
              >
                {m.admin.apply}
              </button>
            </form>
            {list.items.length === 0 ? (
              <Card>
                <p className="m-0 text-ink2">
                  {search ? m.admin.devices.noMatch : m.admin.devices.empty}
                </p>
              </Card>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {list.items.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/admin/devices/${encodeURIComponent(d.id)}`}
                      className="grid gap-2 rounded-card border-[1.5px] border-line bg-plate p-4 no-underline hover:border-ink hover:text-ink md:grid-cols-[1.5fr_1.2fr_1.3fr_auto] md:items-center"
                    >
                      <span className="flex flex-col">
                        <span className="text-[18px] font-semibold">{d.ownerName}</span>
                        <span className="text-sm text-ink2">{m.roles[d.ownerRole]}</span>
                      </span>
                      <span className="flex flex-col">
                        <span className="text-[15px]">
                          {d.label ?? fill(m.admin.devices.unnamed, { id: d.id })}
                        </span>
                        <span className="break-all text-sm text-ink2">{d.id}</span>
                      </span>
                      <span className="flex flex-col text-sm">
                        <span>
                          {fill(m.admin.devices.registered, { date: date(d.registeredAt, lang) })}
                        </span>
                        <span>
                          {m.admin.devices.lastSync}:{' '}
                          {d.lastSyncAt ? dateTime(d.lastSyncAt, lang) : m.admin.never}
                        </span>
                        {d.clipsWaiting > 0 && (
                          <span className="font-semibold">
                            {fill(m.admin.devices.clipsWaiting, { n: d.clipsWaiting })}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 md:justify-end">
                        <DeviceStatusChip status={d.status} m={m} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {list.nextCursor && (
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

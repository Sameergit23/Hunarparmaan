import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeviceDetail, type DeviceAction } from '@hunarpramaan/contracts';
import { AdminShell } from '@/components/admin-shell';
import { DeviceStatusChip } from '@/components/admin-status';
import { ConfirmAction } from '@/components/confirm-action';
import { Card, Chip, PageTitle } from '@/components/wire';
import { reasonsFor } from '@/lib/admin';
import { ApiRequestError, apiGet } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { deviceAction } from './actions';

export const metadata = { title: 'Phone' };

/** Which reasons each button offers; the reason decides the status. */
const REASONS: Record<DeviceAction, string[]> = {
  mark_lost: ['lost', 'stolen', 'suspected_compromise'],
  retire: ['retired', 'replaced'],
};

/** D2 (app flow section 3): one phone, what can be done, and for a lost one, what to re-assess. */
export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deviceId = decodeURIComponent(id);
  return (
    <AdminShell active="devices" path={`/admin/devices/${id}`}>
      {async ({ m, lang, user }) => {
        let d: DeviceDetail;
        try {
          d = await apiGet(`/v1/admin/devices/${encodeURIComponent(deviceId)}`, DeviceDetail);
        } catch (error) {
          if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400))
            notFound();
          throw error;
        }
        const name = d.label ?? fill(m.admin.devices.unnamed, { id: d.id });
        const facts: [string, string][] = [
          [m.admin.device.registered, date(d.registeredAt, lang)],
          [m.admin.device.lastSync, d.lastSyncAt ? dateTime(d.lastSyncAt, lang) : m.admin.never],
          [m.admin.device.clipsWaiting, String(d.clipsWaiting)],
        ];
        const effects: Record<DeviceAction, string> = {
          mark_lost: m.admin.effects.mark_lost,
          retire: m.admin.effects.retire,
        };
        return (
          <>
            <PageTitle title={name} body={d.id}>
              <DeviceStatusChip status={d.status} m={m} />
            </PageTitle>
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <Card title={m.admin.person.details}>
                <p className="m-0 text-[15px]">
                  {m.admin.device.owner}:{' '}
                  <Link href={`/admin/people/${d.ownerId}`} className="font-semibold">
                    {d.ownerName}
                  </Link>
                  {', '}
                  {m.roles[d.ownerRole]}
                </p>
                <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
                  {facts.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-[15px] text-ink2">{label}</dt>
                      <dd className="m-0 text-[15px] font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {d.statusChangedAt && d.statusChangedBy && (
                  <p className="m-0 text-[15px] text-ink2">
                    {fill(m.admin.device.statusChanged, {
                      name: d.statusChangedBy,
                      time: dateTime(d.statusChangedAt, lang),
                    })}
                  </p>
                )}
              </Card>
              <Card title={m.admin.person.actions} strong>
                {d.ownerId === user.id ? (
                  <p className="m-0 text-[15px]">{m.admin.device.own}</p>
                ) : d.allowedActions.length === 0 ? (
                  <p className="m-0 text-[15px]">{m.admin.device.noActions}</p>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    {d.allowedActions.map((action) => (
                      <ConfirmAction
                        key={action}
                        trigger={m.admin.actions[action]}
                        kind={action}
                        title={fill(m.admin.titles[action], { phone: name })}
                        effects={[effects[action]]}
                        reasons={reasonsFor('device.revoked', m, REASONS[action])}
                        confirm={m.admin.actions[action]}
                        action={deviceAction.bind(null, d.id)}
                        labels={m.admin.confirm}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>
            {d.status === 'lost' && (
              <Card title={m.admin.device.reassessTitle} strong>
                <p className="m-0 text-[15px] text-ink2">{m.admin.device.reassessBody}</p>
                {d.sessionsToReassess.length === 0 ? (
                  <p className="m-0">{m.admin.device.reassessNone}</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {d.sessionsToReassess.map((s) => (
                      <li
                        key={s.sessionId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-card border-[1.5px] border-line bg-plate p-3"
                      >
                        <span className="flex flex-col">
                          <span className="font-semibold">{s.qualificationTitle[lang]}</span>
                          <span className="text-sm text-ink2">
                            {fill(m.admin.device.started, { date: dateTime(s.startedAt, lang) })}
                          </span>
                          <span className="break-all text-sm text-ink2">{s.sessionId}</span>
                        </span>
                        <Chip tone="neutral">
                          {s.reason === 'unsigned'
                            ? m.admin.device.unsigned
                            : m.admin.device.clipsWaitingReason}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </>
        );
      }}
    </AdminShell>
  );
}

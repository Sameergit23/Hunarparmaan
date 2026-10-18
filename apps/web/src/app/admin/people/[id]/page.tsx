import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccountDetail, type AccountAction } from '@hunarpramaan/contracts';
import { AdminShell } from '@/components/admin-shell';
import { AccountStatusChip, DeviceStatusChip, LockedChip } from '@/components/admin-status';
import { ConfirmAction } from '@/components/confirm-action';
import { Card, Label, PageTitle } from '@/components/wire';
import { reasonsFor } from '@/lib/admin';
import { ApiRequestError, apiGet } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { accountAction } from './actions';
import { AuditRows } from '@/components/audit-rows';

export const metadata = { title: 'Person' };

const ACTION_OF = {
  deactivate: 'account.deactivated',
  reactivate: 'account.reactivated',
  unlock: 'account.unlocked',
  reset_pin: 'account.pin_reset',
} as const satisfies Record<AccountAction, string>;

/** P2 (app flow section 3): one account, its phones, its recent admin actions and what can be done. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell active="people" path={`/admin/people/${id}`}>
      {async ({ m, lang }) => {
        let a: AccountDetail;
        try {
          a = await apiGet(`/v1/admin/accounts/${encodeURIComponent(id)}`, AccountDetail);
        } catch (error) {
          if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400))
            notFound();
          throw error;
        }
        const facts: [string, string][] = [
          [m.admin.person.number, a.phone],
          [m.admin.person.organisation, a.organisationName[lang]],
          [m.admin.person.created, dateTime(a.createdAt, lang)],
          [m.admin.person.invitedBy, a.invitedBy ?? m.admin.person.notInvited],
          [
            m.admin.people.lastSignIn,
            a.lastSignInAt ? dateTime(a.lastSignInAt, lang) : m.admin.never,
          ],
          [m.admin.people.lastSync, a.lastSyncAt ? dateTime(a.lastSyncAt, lang) : m.admin.never],
          [m.admin.person.failedTries, String(a.failedPinAttempts)],
        ];
        const effects: Record<AccountAction, string[]> = {
          deactivate: [
            fill(m.admin.effects.deactivate, { name: a.name }),
            ...(a.clipsWaiting > 0 ? [fill(m.admin.effects.waiting, { n: a.clipsWaiting })] : []),
          ],
          reactivate: [fill(m.admin.effects.reactivate, { name: a.name })],
          unlock: [fill(m.admin.effects.unlock, { name: a.name })],
          reset_pin: [fill(m.admin.effects.reset_pin, { name: a.name })],
        };
        return (
          <>
            <PageTitle title={a.name} body={`${m.roles[a.role]}, ${a.organisationName[lang]}`}>
              <span className="flex flex-wrap gap-2">
                <AccountStatusChip status={a.status} m={m} />
                {a.locked && <LockedChip m={m} />}
              </span>
            </PageTitle>
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <Card title={m.admin.person.details}>
                <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
                  {facts.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-[15px] text-ink2">{label}</dt>
                      <dd className="m-0 text-[15px] font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {a.locked && a.lockedUntil && (
                  <p className="m-0 font-semibold">
                    {fill(m.admin.person.lockedUntil, { time: dateTime(a.lockedUntil, lang) })}
                  </p>
                )}
                {a.statusChangedAt && a.statusChangedBy && (
                  <p className="m-0 text-[15px] text-ink2">
                    {fill(m.admin.person.statusChanged, {
                      name: a.statusChangedBy,
                      time: dateTime(a.statusChangedAt, lang),
                    })}
                  </p>
                )}
              </Card>
              <Card title={m.admin.person.actions} strong>
                {a.self ? (
                  <p className="m-0 text-[15px]">{m.admin.person.own}</p>
                ) : !a.actionable ? (
                  <p className="m-0 text-[15px]">{m.admin.person.notActionable}</p>
                ) : a.allowedActions.length === 0 ? (
                  <p className="m-0 text-[15px]">
                    {a.status === 'closed' ? m.admin.person.closed : m.admin.person.onlyIssuer}
                  </p>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    {a.allowedActions.map((action) => (
                      <ConfirmAction
                        key={action}
                        trigger={m.admin.actions[action]}
                        kind={action}
                        title={fill(m.admin.titles[action], { name: a.name })}
                        effects={effects[action]}
                        reasons={reasonsFor(ACTION_OF[action], m)}
                        confirm={m.admin.actions[action]}
                        action={accountAction.bind(null, a.id, action)}
                        labels={m.admin.confirm}
                        code={
                          action === 'reset_pin'
                            ? {
                                title: m.admin.resetCode.title,
                                valid: m.admin.resetCode.valid,
                                how: fill(m.admin.resetCode.how, { name: a.name }),
                                done: m.admin.invite.passedOn,
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <section className="flex flex-col gap-3">
              <Label>{m.admin.person.phones}</Label>
              {a.devices.length === 0 ? (
                <p className="m-0 text-ink2">{m.admin.person.noPhones}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {a.devices.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/admin/devices/${encodeURIComponent(d.id)}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-card border-[1.5px] border-line bg-plate p-3 no-underline hover:border-ink hover:text-ink"
                      >
                        <span className="flex flex-col">
                          <span className="font-semibold">
                            {d.label ?? fill(m.admin.devices.unnamed, { id: d.id })}
                          </span>
                          <span className="text-sm text-ink2">
                            {m.admin.people.lastSync}:{' '}
                            {d.lastSyncAt ? dateTime(d.lastSyncAt, lang) : m.admin.never}
                          </span>
                        </span>
                        <DeviceStatusChip status={d.status} m={m} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-3">
              <Label>{m.admin.person.recent}</Label>
              {a.recentActions.length === 0 ? (
                <p className="m-0 text-ink2">{m.admin.person.noRecent}</p>
              ) : (
                <AuditRows entries={a.recentActions} m={m} lang={lang} showOrganisation={false} />
              )}
            </section>
          </>
        );
      }}
    </AdminShell>
  );
}

import { Clock, KeyRound, Lock, UserCheck, UserX } from 'lucide-react';
import { AccountView, OrganisationView } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { StepUpForm } from '@/components/admin/step-up-form';
import { OfficeShell } from '@/components/office-shell';
import { Card, Chip, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { fill, type Lang, type Messages } from '@/lib/i18n';
import { deactivateAccount, reactivateAccount, unlockAccount } from '../actions';
import { InviteForm } from './invite-form';

export const metadata = { title: 'People' };

function StatusChip({ a, m, lang }: { a: AccountView; m: Messages; lang: Lang }) {
  if (a.lockedUntil && new Date(a.lockedUntil) > new Date()) {
    return (
      <Chip tone="error" icon={Lock}>
        {fill(m.admin.people.lockedUntil, { time: dateTime(a.lockedUntil, lang) })}
      </Chip>
    );
  }
  switch (a.status) {
    case 'active':
      return (
        <Chip tone="neutral" icon={UserCheck}>
          {m.admin.status.active}
        </Chip>
      );
    case 'invited':
      return (
        <Chip tone="progress" icon={KeyRound}>
          {m.admin.status.invited}
        </Chip>
      );
    default:
      return (
        <Chip tone="neutral" icon={Clock}>
          {m.admin.status.draining}
        </Chip>
      );
  }
}

function PersonRow({
  a,
  m,
  lang,
  me,
  showOrg,
}: {
  a: AccountView;
  m: Messages;
  lang: Lang;
  me: string;
  showOrg: boolean;
}) {
  const locked = a.lockedUntil !== null && new Date(a.lockedUntil) > new Date();
  const reasons = Object.entries(m.admin.deactivationReason).map(([value, label]) => ({
    value,
    label,
  }));
  return (
    <li className="grid gap-3 border-b-[1.5px] border-divider py-4 last:border-0 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-semibold">{a.name}</span>
          {a.id === me && <Chip tone="neutral">{m.admin.you}</Chip>}
          <StatusChip a={a} m={m} lang={lang} />
        </span>
        <span className="text-[15px] text-ink2">
          {m.roles[a.role]}
          {showOrg && `, ${a.orgName}`}, {a.phoneMasked}
        </span>
        <span className="text-sm text-ink2">
          {a.lastSyncAt
            ? fill(m.admin.lastSync, { date: dateTime(a.lastSyncAt, lang) })
            : m.admin.neverSynced}
          {a.devices > 0 && `, ${fill(m.admin.people.devices, { n: a.devices })}`}
        </span>
        {a.deactivation && (
          <span className="text-sm">
            {fill(m.admin.people.deactivatedBy, {
              name: a.deactivation.byName,
              date: date(a.deactivation.at, lang),
              reason: m.admin.deactivationReason[a.deactivation.reason],
            })}
          </span>
        )}
      </div>
      {a.id !== me && (
        <div className="flex flex-col items-start gap-2 md:items-end">
          {a.status === 'active' && (
            <StepUpForm
              action={deactivateAccount.bind(null, a.id, a.name)}
              label={m.admin.people.deactivate}
              body={m.admin.people.deactivateBody}
              icon={UserX}
              m={m}
              reasons={reasons}
            />
          )}
          {a.status === 'draining' && (
            <StepUpForm
              action={reactivateAccount.bind(null, a.id, a.name)}
              label={m.admin.people.reactivate}
              body={m.admin.people.reactivateBody}
              icon={UserCheck}
              m={m}
            />
          )}
          {locked && (
            <StepUpForm
              action={unlockAccount.bind(null, a.id, a.name)}
              label={m.admin.people.unlock}
              body={m.admin.people.unlockBody}
              icon={Lock}
              m={m}
            />
          )}
        </div>
      )}
    </li>
  );
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  return (
    <OfficeShell active="people" path="/admin/people">
      {async ({ m, lang, user }) => {
        const platform = user.role === 'platform_admin';
        const orgs = await apiGet('/v1/admin/organisations', z.array(OrganisationView));
        const orgFilter = platform && org && orgs.some((o) => o.id === org) ? org : undefined;
        const people = await apiGet(
          `/v1/admin/people${orgFilter ? `?orgId=${orgFilter}` : ''}`,
          z.array(AccountView),
        );
        const own = orgs.find((o) => o.id === user.orgId);
        const sorted = [...people].sort(
          (a, b) => a.orgName.localeCompare(b.orgName) || a.name.localeCompare(b.name),
        );
        return (
          <>
            <PageTitle
              title={m.admin.people.title}
              body={
                platform
                  ? m.admin.people.bodyPlatform
                  : fill(m.admin.people.body, { org: own?.name ?? '' })
              }
            />
            <p className="m-0 text-[15px] font-semibold">{m.admin.neverDecides}</p>
            {platform && (
              <form className="flex flex-wrap items-end gap-2" method="get">
                <label className="flex flex-col gap-1 text-[15px] font-semibold">
                  {m.admin.org}
                  <select
                    name="org"
                    defaultValue={orgFilter ?? ''}
                    className="min-h-touch rounded-card border-2 border-ink bg-plate px-3 text-[16px]"
                  >
                    <option value="">{m.admin.allOrgs}</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="min-h-touch rounded-card border-2 border-ink bg-plate px-4 text-[16px] font-semibold"
                >
                  {m.admin.show}
                </button>
              </form>
            )}
            <InviteForm
              m={m}
              inviterRole={user.role}
              orgs={(platform ? orgs : orgs.filter((o) => o.id === user.orgId)).filter(
                (o) => o.status === 'active',
              )}
            />
            <Card>
              {sorted.length === 0 ? (
                <p className="m-0 text-ink2">{m.admin.people.none}</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {sorted.map((a) => (
                    <PersonRow key={a.id} a={a} m={m} lang={lang} me={user.id} showOrg={platform} />
                  ))}
                </ul>
              )}
            </Card>
          </>
        );
      }}
    </OfficeShell>
  );
}

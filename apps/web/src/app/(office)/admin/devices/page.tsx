import { PhoneOff, Smartphone, TriangleAlert } from 'lucide-react';
import { DeviceView, OrganisationView, type DeviceStatus } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { StepUpForm } from '@/components/admin/step-up-form';
import { Icon } from '@/components/icon';
import { OfficeShell } from '@/components/office-shell';
import { Card, Chip, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date, dateTime } from '@/lib/format';
import { fill, type Messages } from '@/lib/i18n';
import { revokeDevice } from '../actions';

export const metadata = { title: 'Phones' };

function DeviceChip({ status, m }: { status: DeviceStatus; m: Messages }) {
  if (status === 'active') {
    return (
      <Chip tone="neutral" icon={Smartphone}>
        {m.admin.deviceStatus.active}
      </Chip>
    );
  }
  return (
    <Chip tone={status === 'lost' ? 'error' : 'progress'} icon={PhoneOff}>
      {m.admin.deviceStatus[status]}
    </Chip>
  );
}

export default function DevicesPage() {
  return (
    <OfficeShell active="devices" path="/admin/devices">
      {async ({ m, lang, user }) => {
        const platform = user.role === 'platform_admin';
        const [devices, orgs] = await Promise.all([
          apiGet('/v1/admin/devices', z.array(DeviceView)),
          apiGet('/v1/admin/organisations', z.array(OrganisationView)),
        ]);
        const own = orgs.find((o) => o.id === user.orgId);
        const reasons = (['lost', 'retired', 'replaced'] as const).map((value) => ({
          value,
          label: m.admin.devices.reasons[value],
        }));
        return (
          <>
            <PageTitle
              title={m.admin.devices.title}
              body={
                platform
                  ? m.admin.devices.bodyPlatform
                  : fill(m.admin.devices.body, { org: own?.name ?? '' })
              }
            />
            <Card>
              {devices.length === 0 ? (
                <p className="m-0 text-ink2">{m.admin.devices.none}</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {devices.map((d) => (
                    <li
                      key={d.id}
                      className="grid gap-3 border-b-[1.5px] border-divider py-4 last:border-0 md:grid-cols-[1fr_auto]"
                    >
                      <div className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[17px] font-semibold">{d.label ?? d.id}</span>
                          <DeviceChip status={d.status} m={m} />
                        </span>
                        <span className="text-[15px] text-ink2">
                          {fill(m.admin.devices.owner, {
                            name: d.ownerName,
                            role: m.roles[d.ownerRole],
                          })}
                          {platform && `, ${d.orgName}`}
                        </span>
                        <span className="text-sm text-ink2">
                          {fill(m.admin.devices.registered, { date: date(d.registeredAt, lang) })}
                          {', '}
                          {d.lastSyncAt
                            ? fill(m.admin.lastSync, { date: dateTime(d.lastSyncAt, lang) })
                            : m.admin.neverSynced}
                        </span>
                        {d.affectedSessions > 0 && (
                          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                            <Icon as={TriangleAlert} size={18} className="text-phaseRed" />
                            {fill(m.admin.devices.affected, { n: d.affectedSessions })}
                          </span>
                        )}
                      </div>
                      {d.status === 'active' && (
                        <div className="flex flex-col items-start gap-2 md:items-end">
                          <StepUpForm
                            action={revokeDevice.bind(null, d.id)}
                            label={m.admin.devices.revoke}
                            body={m.admin.devices.revokeBody}
                            icon={PhoneOff}
                            m={m}
                            reasons={reasons}
                          >
                            <label className="flex flex-col gap-1 text-[15px] font-semibold">
                              {m.admin.devices.lostSince}
                              <input
                                type="datetime-local"
                                name="lostSince"
                                className="min-h-touch rounded-card border-2 border-ink bg-plate px-3 text-[16px]"
                              />
                            </label>
                          </StepUpForm>
                        </div>
                      )}
                    </li>
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

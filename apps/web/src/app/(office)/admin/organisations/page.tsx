import { Ban, Building2, CircleAlert, RotateCcw } from 'lucide-react';
import { OrganisationView } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { StepUpForm } from '@/components/admin/step-up-form';
import { Icon } from '@/components/icon';
import { OfficeShell } from '@/components/office-shell';
import { Card, Chip, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { fill } from '@/lib/i18n';
import { reactivateOrganisation, suspendOrganisation } from '../actions';
import { CreateOrganisationForm } from './create-form';

export const metadata = { title: 'Organisations' };

export default function OrganisationsPage() {
  return (
    <OfficeShell active="organisations" path="/admin/organisations">
      {async ({ m }) => {
        const orgs = await apiGet('/v1/admin/organisations', z.array(OrganisationView));
        const reasons = Object.entries(m.admin.organisations.suspendReasons).map(
          ([value, label]) => ({ value, label }),
        );
        return (
          <>
            <PageTitle title={m.admin.organisations.title} body={m.admin.organisations.body} />
            <p className="m-0 text-[15px] font-semibold">{m.admin.neverDecides}</p>
            <CreateOrganisationForm m={m} />
            <Card>
              {orgs.length === 0 ? (
                <p className="m-0 text-ink2">{m.admin.organisations.none}</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {orgs.map((o) => (
                    <li
                      key={o.id}
                      className="grid gap-3 border-b-[1.5px] border-divider py-4 last:border-0 md:grid-cols-[1fr_auto]"
                    >
                      <div className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <Icon as={Building2} size={20} />
                          <span className="text-[17px] font-semibold">{o.name}</span>
                          {o.status === 'active' ? (
                            <Chip tone="neutral">{m.admin.orgStatus.active}</Chip>
                          ) : (
                            <Chip tone="progress" icon={Ban}>
                              {m.admin.orgStatus.suspended}
                            </Chip>
                          )}
                        </span>
                        <span className="text-[15px] text-ink2">
                          {m.admin.orgKind[o.kind]},{' '}
                          {fill(m.admin.organisations.accounts, { n: o.accounts })},{' '}
                          {fill(m.admin.organisations.admins, { n: o.admins })}
                        </span>
                        {o.kind !== 'regulator' && o.admins === 1 && (
                          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                            <Icon as={CircleAlert} size={18} />
                            {m.admin.organisations.oneAdmin}
                          </span>
                        )}
                      </div>
                      {o.kind !== 'operator' && (
                        <div className="flex flex-col items-start gap-2 md:items-end">
                          {o.status === 'active' ? (
                            <StepUpForm
                              action={suspendOrganisation.bind(null, o.id, o.name)}
                              label={m.admin.organisations.suspend}
                              body={m.admin.organisations.suspendBody}
                              icon={Ban}
                              m={m}
                              reasons={reasons}
                            />
                          ) : (
                            <StepUpForm
                              action={reactivateOrganisation.bind(null, o.id, o.name)}
                              label={m.admin.organisations.reactivate}
                              icon={RotateCcw}
                              m={m}
                            />
                          )}
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

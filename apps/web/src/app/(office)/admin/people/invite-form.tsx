'use client';

import { useActionState, useState } from 'react';
import { CircleCheck, TriangleAlert, UserPlus } from 'lucide-react';
import { Role, canGrant, type OrganisationView } from '@hunarpramaan/contracts';
import { PinField } from '@/components/admin/step-up-form';
import { InviteCode } from '@/components/admin/invite-code';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { inviteAccount, type AdminState } from '../actions';

const input = 'min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[17px]';

/**
 * Invite a person: only the roles this admin may give in the chosen
 * organisation (GRANTABLE_ROLES and ROLES_BY_ORG_KIND). The API checks again.
 */
export function InviteForm({
  m,
  inviterRole,
  orgs,
}: {
  m: Messages;
  inviterRole: Role;
  orgs: OrganisationView[];
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(inviteAccount, {});
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const org = orgs.find((o) => o.id === orgId);
  const roles = org ? Role.options.filter((r) => canGrant(inviterRole, r, org.kind)) : [];
  if (orgs.length === 0) return null;
  return (
    <details className="group" open={!!state.message && !state.ok}>
      <summary className="inline-flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-card border-2 border-ink bg-ink px-4 text-[17px] font-semibold text-plate [&::-webkit-details-marker]:hidden">
        <Icon as={UserPlus} size={20} />
        {m.admin.people.invite}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {state.ok && state.invite ? (
          <>
            <p role="status" className="m-0 flex items-center gap-2 font-semibold">
              <Icon as={CircleCheck} className="text-earthGreen" />
              {m.admin.people.invite}
            </p>
            <InviteCode invite={state.invite} m={m} />
          </>
        ) : (
          <form
            action={action}
            className="flex max-w-md flex-col gap-3 rounded-card border-2 border-ink bg-plate p-4"
          >
            <p className="m-0 text-[15px]">{m.admin.people.inviteBody}</p>
            {state.message && (
              <p role="alert" className="m-0 flex items-start gap-2 font-semibold">
                <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
                {state.message}
              </p>
            )}
            {orgs.length > 1 ? (
              <label className="flex flex-col gap-1 text-[15px] font-semibold">
                {m.admin.org}
                <select
                  name="orgId"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className={input}
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="orgId" value={orgId} />
            )}
            <label className="flex flex-col gap-1 text-[15px] font-semibold">
              {m.admin.role}
              <select name="role" required className={input}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {m.roles[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[15px] font-semibold">
              {m.admin.name}
              <input name="name" required minLength={2} maxLength={80} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-[15px] font-semibold">
              {m.admin.phone}
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                required
                pattern="(\+91)?[6-9]\d{9}"
                className={input}
              />
            </label>
            <PinField id="invite-pin" m={m} />
            <Button
              type="submit"
              icon={UserPlus}
              disabled={pending || roles.length === 0}
              className="self-start"
            >
              {m.admin.people.createInvite}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}

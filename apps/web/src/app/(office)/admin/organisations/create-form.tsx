'use client';

import { useActionState, useState } from 'react';
import { Building2, CircleCheck, TriangleAlert } from 'lucide-react';
import { OrgKind } from '@hunarpramaan/contracts';
import { InviteCode } from '@/components/admin/invite-code';
import { PinField } from '@/components/admin/step-up-form';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { createOrganisation, type AdminState } from '../actions';

const input = 'min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[17px]';
const KINDS = OrgKind.options.filter((k) => k !== 'operator');

/** A new organisation and its first admin, who invites the rest of their staff. */
export function CreateOrganisationForm({ m }: { m: Messages }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createOrganisation, {});
  const [kind, setKind] = useState<string>(KINDS[0] ?? 'training_partner');
  return (
    <details className="group" open={!!state.message && !state.ok}>
      <summary className="inline-flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-card border-2 border-ink bg-ink px-4 text-[17px] font-semibold text-plate [&::-webkit-details-marker]:hidden">
        <Icon as={Building2} size={20} />
        {m.admin.organisations.add}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {state.ok ? (
          <>
            <p role="status" className="m-0 flex items-center gap-2 font-semibold">
              <Icon as={CircleCheck} className="text-earthGreen" />
              {state.message}
            </p>
            {state.invite && <InviteCode invite={state.invite} m={m} />}
          </>
        ) : (
          <form
            action={action}
            className="flex max-w-md flex-col gap-3 rounded-card border-2 border-ink bg-plate p-4"
          >
            {state.message && (
              <p role="alert" className="m-0 flex items-start gap-2 font-semibold">
                <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
                {state.message}
              </p>
            )}
            <label className="flex flex-col gap-1 text-[15px] font-semibold">
              {m.admin.organisations.orgName}
              <input name="name" required minLength={3} maxLength={120} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-[15px] font-semibold">
              {m.admin.organisations.kind}
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={input}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {m.admin.orgKind[k]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="m-0 flex flex-col gap-3 rounded-card border-[1.5px] border-line p-3">
              <legend className="px-1 text-[15px] font-semibold">
                {m.admin.organisations.firstAdmin}
              </legend>
              {kind === 'regulator' && (
                <p className="m-0 text-[15px]">{m.admin.organisations.noInvite}</p>
              )}
              <label className="flex flex-col gap-1 text-[15px] font-semibold">
                {m.admin.name}
                <input name="adminName" required minLength={2} maxLength={80} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-[15px] font-semibold">
                {m.admin.phone}
                <input
                  name="adminPhone"
                  type="tel"
                  inputMode="numeric"
                  required
                  pattern="(\+91)?[6-9]\d{9}"
                  className={input}
                />
              </label>
            </fieldset>
            <PinField id="org-pin" m={m} />
            <Button type="submit" icon={Building2} disabled={pending} className="self-start">
              {m.admin.organisations.add}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}

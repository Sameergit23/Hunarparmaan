'use client';

import { useActionState, useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { AdminState } from '@/app/(office)/admin/actions';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { InviteCode } from './invite-code';

/**
 * An admin action behind a confirmation: the reason (when the action has one)
 * and the admin's own PIN. Destructive actions are secondary buttons, never red
 * (docs/design/access-control.md "The admin panel").
 */
export function StepUpForm({
  action,
  label,
  body,
  icon,
  m,
  reasons,
  children,
}: {
  action: (prev: AdminState, form: FormData) => Promise<AdminState>;
  label: string;
  body?: string;
  icon: LucideIcon;
  m: Messages;
  /** Reason codes and their words; the first one is not preselected. */
  reasons?: { value: string; label: string }[];
  /** Extra fields, inside the form. */
  children?: ReactNode;
}) {
  const [state, run, pending] = useActionState<AdminState, FormData>(action, {});
  const id = useId();
  if (state.ok) {
    return (
      <div className="flex flex-col gap-3">
        {state.message && (
          <p role="status" className="m-0 flex items-center gap-2 font-semibold">
            <Icon as={CircleCheck} className="text-earthGreen" />
            {state.message}
          </p>
        )}
        {state.invite && <InviteCode invite={state.invite} m={m} />}
      </div>
    );
  }
  return (
    <details className="group">
      <summary className="inline-flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-card border-2 border-ink bg-plate px-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
        <Icon as={icon} size={20} />
        {label}
      </summary>
      <form
        action={run}
        className="mt-3 flex max-w-md flex-col gap-3 rounded-card border-2 border-ink bg-plate p-4"
      >
        {body && <p className="m-0 text-[15px]">{body}</p>}
        {state.message && (
          <p role="alert" className="m-0 flex items-start gap-2 font-semibold">
            <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
            {state.message}
          </p>
        )}
        {children}
        {reasons && (
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-[15px] font-semibold">{m.admin.reason}</legend>
            {reasons.map((r) => (
              <label key={r.value} className="flex min-h-touch items-center gap-2 text-[16px]">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  required
                  className="size-5 accent-ink"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
        )}
        <PinField id={`${id}-pin`} m={m} />
        <Button
          type="submit"
          tone="secondary"
          icon={icon}
          disabled={pending}
          className="self-start"
        >
          {label}
        </Button>
      </form>
    </details>
  );
}

export function PinField({ id, m }: { id: string; m: Messages }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {m.admin.pin}
      </label>
      <input
        id={id}
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        pattern="\d{4,6}"
        required
        className="min-h-touch w-40 rounded-card border-2 border-ink bg-plate px-3 text-[18px] tracking-widest"
      />
      <span className="text-sm text-ink2">{m.admin.pinHelp}</span>
    </div>
  );
}

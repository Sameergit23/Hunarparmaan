'use client';

import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { MailPlus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Icon } from '@/components/icon';
import { OneTimeCode } from '@/components/one-time-code';
import { Button } from '@/components/wire';
import type { AdminActionState } from '@/components/confirm-action';
import { fill } from '@/lib/i18n/fill';
import { createInvite } from './actions';

const field = 'min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[17px]';

export interface InviteFormText {
  name: string;
  phone: string;
  role: string;
  chooseRole: string;
  organisation: string;
  chooseOrganisation: string;
  reason: string;
  continue: string;
  confirmTitle: string;
  confirmEffect: string;
  submit: string;
  codeTitle: string;
  codeValid: string;
  codeHow: string;
  passedOn: string;
  pin: string;
  cancel: string;
  badPhone: string;
}

/**
 * P3 (app flow section 3): name, number, role (only the roles this admin may
 * grant) and reason; then the confirmation with the PIN; then the code, once.
 */
export function InviteForm({
  t,
  roles,
  reasons,
  organisations,
  ownOrganisation,
  defaults,
}: {
  t: InviteFormText;
  roles: { value: string; label: string }[];
  reasons: { code: string; label: string }[];
  /** Only for the platform admin, who picks the organisation. */
  organisations: { value: string; label: string }[] | null;
  /** The admin's own organisation, which everyone else invites into. */
  ownOrganisation: string;
  defaults: { name: string; role: string };
}) {
  const [state, run, pending] = useActionState<AdminActionState, FormData>(createInvite, {});
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState({ name: '', role: '', org: '' });
  const router = useRouter();
  const id = useId();

  if (state.ok && state.code) {
    return (
      <OneTimeCode
        code={state.code}
        title={t.codeTitle}
        valid={t.codeValid}
        how={fill(t.codeHow, { name: summary.name })}
        done={t.passedOn}
        onDone={() => router.push('/admin/people?tab=invites')}
      />
    );
  }

  const open = () => {
    const f = form.current;
    if (!f) return;
    const named = ['name', 'phone', 'role', 'reason', 'organisationId'];
    for (const name of named) {
      const el = f.elements.namedItem(name);
      const first = el instanceof RadioNodeList ? (el[0] as HTMLInputElement) : el;
      if (first instanceof HTMLInputElement || first instanceof HTMLSelectElement) {
        if (!first.reportValidity()) return;
      }
    }
    const data = new FormData(f);
    const pick = (list: { value: string; label: string }[] | null, key: string) =>
      list?.find((o) => o.value === data.get(key))?.label ?? '';
    setSummary({
      name: String(data.get('name') ?? '').trim(),
      role: pick(roles, 'role'),
      org: organisations ? pick(organisations, 'organisationId') : ownOrganisation,
    });
    dialog.current?.showModal();
  };

  // Not the form's `action`: React would clear every field after a refusal, such as a wrong PIN.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => run(data));
  };

  // Enter submits only from the PIN field.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (e.key !== 'Enter' || target.tagName === 'BUTTON') return;
    if (target.id !== `${id}-pin`) {
      e.preventDefault();
      if (!dialog.current?.open) open();
    }
  };

  return (
    <form ref={form} onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-4">
      {state.error && !dialog.current?.open && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-card border-2 border-phaseRed bg-plate p-3 font-semibold"
        >
          <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1 text-[15px] font-semibold">
        <label htmlFor="invite-name">{t.name}</label>
        <input
          id="invite-name"
          name="name"
          required
          maxLength={120}
          defaultValue={defaults.name}
          autoComplete="off"
          className={field}
        />
      </div>
      <div className="flex flex-col gap-1 text-[15px] font-semibold">
        <label htmlFor="invite-phone">{t.phone}</label>
        <input
          id="invite-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          required
          pattern="(\+91)?[6-9][0-9]{9}"
          title={t.badPhone}
          placeholder="98765 43210"
          autoComplete="off"
          className={field}
        />
      </div>
      {organisations && (
        <div className="flex flex-col gap-1 text-[15px] font-semibold">
          <label htmlFor="invite-organisation">{t.organisation}</label>
          <select
            id="invite-organisation"
            name="organisationId"
            required
            defaultValue=""
            className={field}
          >
            <option value="" disabled>
              {t.chooseOrganisation}
            </option>
            {organisations.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1 text-[15px] font-semibold">
        <label htmlFor="invite-role">{t.role}</label>
        <select
          id="invite-role"
          name="role"
          required
          defaultValue={defaults.role}
          className={field}
        >
          <option value="" disabled>
            {t.chooseRole}
          </option>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-semibold">{t.reason}</legend>
        {reasons.map((reason) => (
          <label
            key={reason.code}
            className="flex min-h-touch cursor-pointer items-center gap-3 rounded-card border-[1.5px] border-line bg-plate px-3 has-[:checked]:border-2 has-[:checked]:border-ink"
          >
            <input
              type="radio"
              name="reason"
              value={reason.code}
              required
              className="size-5 accent-ink"
            />
            <span className="text-[16px]">{reason.label}</span>
          </label>
        ))}
      </fieldset>
      <Button type="button" icon={MailPlus} onClick={open} className="self-start">
        {t.continue}
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(34rem,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-y-auto rounded-card border-2 border-ink bg-plate p-5 text-ink backdrop:bg-ink/60"
      >
        <div className="flex flex-col gap-4">
          <h2 id={`${id}-title`} className="m-0 font-heading text-[24px] font-bold leading-tight">
            {fill(t.confirmTitle, summary)}
          </h2>
          <p className="m-0 text-[16px]">{t.confirmEffect}</p>
          <label htmlFor={`${id}-pin`} className="text-[15px] font-semibold">
            {t.pin}
          </label>
          <input
            id={`${id}-pin`}
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            minLength={4}
            maxLength={6}
            required
            autoFocus
            className={field}
          />
          {state.error && (
            <p role="alert" className="m-0 flex items-start gap-2 text-[15px] font-semibold">
              <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" icon={ShieldCheck} disabled={pending}>
              {t.submit}
            </Button>
            <Button type="button" tone="secondary" onClick={() => dialog.current?.close()}>
              {t.cancel}
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}

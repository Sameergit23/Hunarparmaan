'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  KeyRound,
  LockOpen,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import type { AccountAction, DeviceAction } from '@hunarpramaan/contracts';
import { Icon } from './icon';
import { OneTimeCode } from './one-time-code';
import { Button } from './wire';

/** Each admin action's icon. Named here: a server page can't hand a component to this one. */
const ICONS = {
  deactivate: UserX,
  reactivate: RotateCcw,
  unlock: LockOpen,
  reset_pin: KeyRound,
  mark_lost: TriangleAlert,
  retire: Archive,
} satisfies Record<AccountAction | DeviceAction, unknown>;

/** What an admin write's server action answers. */
export interface AdminActionState {
  ok?: boolean;
  error?: string;
  /** A PIN reset's one-time code, shown once. */
  code?: string;
}

export type AdminAction = (prev: AdminActionState, formData: FormData) => Promise<AdminActionState>;

interface DialogProps {
  title: string;
  effects: string[];
  reasons: { code: string; label: string }[];
  confirm: string;
  action: AdminAction;
  hidden?: Record<string, string> | undefined;
  labels: { reason: string; pin: string; cancel: string };
  code?: { title: string; valid: string; how: string; done: string } | undefined;
  onClose: (changed: boolean) => void;
}

/** The form inside the dialog. A fresh one each time the dialog opens, so nothing carries over. */
function ConfirmForm({
  title,
  effects,
  reasons,
  confirm,
  action,
  hidden,
  labels,
  code,
  onClose,
}: DialogProps) {
  const [state, run, pending] = useActionState<AdminActionState, FormData>(action, {});
  const id = useId();
  useEffect(() => {
    if (state.ok && !state.code) onClose(true);
  }, [state, onClose]);

  if (state.ok && state.code && code) {
    return <OneTimeCode code={state.code} {...code} onDone={() => onClose(true)} />;
  }

  // Not the form's `action`: React would clear the reason after a refusal, such as a wrong PIN.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => run(data));
  };

  // Enter submits only from the PIN field, so a slip in the reason list can't confirm.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.id !== `${id}-pin` && target.tagName !== 'BUTTON') {
      e.preventDefault();
    }
  };

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="m-0 font-heading text-[24px] font-bold leading-tight">
        {title}
      </h2>
      {effects.map((effect) => (
        <p key={effect} className="m-0 text-[16px]">
          {effect}
        </p>
      ))}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-semibold">{labels.reason}</legend>
        {reasons.map((reason, i) => (
          <label
            key={reason.code}
            className="flex min-h-touch cursor-pointer items-center gap-3 rounded-card border-[1.5px] border-line bg-plate px-3 has-[:checked]:border-2 has-[:checked]:border-ink"
          >
            <input
              type="radio"
              name="reason"
              value={reason.code}
              required
              defaultChecked={reasons.length === 1 && i === 0}
              className="size-5 accent-ink"
            />
            <span className="text-[16px]">{reason.label}</span>
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-pin`} className="text-[15px] font-semibold">
        {labels.pin}
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
        aria-describedby={state.error ? `${id}-error` : undefined}
        className="min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[18px] tracking-wide"
      />
      {state.error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="m-0 flex items-start gap-2 text-[15px] font-semibold"
        >
          <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" icon={ShieldCheck} disabled={pending}>
          {confirm}
        </Button>
        <Button type="button" tone="secondary" onClick={() => onClose(false)}>
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * One dialog for every admin write (app flow section 4): what will happen in
 * plain words, a required reason, and the admin's own PIN. The primary button
 * names the action and is black, never red. A native modal dialog, so focus
 * stays inside it and Escape cancels; focus starts on the reason.
 */
export function ConfirmAction({
  trigger,
  kind,
  triggerTone = 'secondary',
  ...dialog
}: Omit<DialogProps, 'onClose'> & {
  trigger: string;
  /** Which action, for its icon. */
  kind: AccountAction | DeviceAction;
  triggerTone?: 'primary' | 'secondary';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open, attempt]);

  const onClose = (changed: boolean) => {
    setOpen(false);
    // The page shows the new status. The one-time code is gone with the form.
    if (changed) router.refresh();
  };

  return (
    <>
      <Button
        type="button"
        tone={triggerTone}
        icon={ICONS[kind]}
        onClick={() => {
          setAttempt((n) => n + 1);
          setOpen(true);
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(34rem,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-y-auto rounded-card border-2 border-ink bg-plate p-5 text-ink backdrop:bg-ink/60"
      >
        {open && <ConfirmForm key={attempt} {...dialog} onClose={onClose} />}
      </dialog>
    </>
  );
}

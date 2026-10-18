'use client';

import { useActionState } from 'react';
import { CircleCheck, KeyRound, TriangleAlert } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { changePin, type PinState } from './actions';

const input =
  'min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[18px] tracking-wide';

function PinField({
  id,
  label,
  autoComplete,
}: {
  id: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <>
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        minLength={4}
        maxLength={6}
        required
        className={input}
      />
    </>
  );
}

export function PinForm({ m }: { m: Messages }) {
  const [state, action, pending] = useActionState<PinState, FormData>(changePin, {});
  if (state.ok) {
    return (
      <p role="status" className="m-0 flex items-start gap-2 text-[16px] font-semibold">
        <Icon as={CircleCheck} className="mt-0.5 flex-none text-earthGreen" />
        {m.account.done}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-card border-2 border-phaseRed bg-plate p-3 font-semibold"
        >
          <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
          {state.error}
        </p>
      )}
      <PinField id="currentPin" label={m.account.current} autoComplete="current-password" />
      <PinField id="newPin" label={m.pin.new} autoComplete="new-password" />
      <PinField id="repeat" label={m.pin.repeat} autoComplete="new-password" />
      <Button type="submit" icon={KeyRound} disabled={pending}>
        {m.account.changePin}
      </Button>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { CircleCheck, KeyRound, TriangleAlert } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { activate, type ActivateState } from './actions';

const input =
  'min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[18px] tracking-wide';

export function ActivateForm({ m }: { m: Messages }) {
  const [state, action, pending] = useActionState<ActivateState, FormData>(activate, {});
  if (state.fieldReady) {
    return (
      <p
        role="status"
        className="m-0 flex items-start gap-2 rounded-card border-2 border-earthGreen bg-plate p-3 font-semibold"
      >
        <Icon as={CircleCheck} className="mt-0.5 flex-none text-earthGreen" />
        {m.activate.fieldReady}
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
      <label className="flex flex-col gap-1 text-[15px] font-semibold">
        {m.activate.phone}
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-[15px] font-semibold">
        {m.activate.code}
        <input
          name="code"
          required
          autoComplete="one-time-code"
          autoCapitalize="characters"
          className={input}
        />
        <span className="text-sm font-normal text-ink2">{m.activate.codeHelp}</span>
      </label>
      <label className="flex flex-col gap-1 text-[15px] font-semibold">
        {m.activate.pin}
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          required
          autoComplete="new-password"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-[15px] font-semibold">
        {m.activate.pinAgain}
        <input
          name="pinAgain"
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          required
          autoComplete="new-password"
          className={input}
        />
      </label>
      <Button type="submit" icon={KeyRound} disabled={pending}>
        {m.activate.submit}
      </Button>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { CircleCheck, KeyRound, MessageSquare, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/fill';
import { inviteStep, type InviteState } from './actions';

const input =
  'min-h-touch w-full rounded-card border-2 border-ink bg-plate px-3 text-[18px] tracking-wide';
const initial: InviteState = { step: 'phone', phone: '' };

export function InviteForm({ m }: { m: Messages }) {
  const [state, action, pending] = useActionState(inviteStep, initial);

  if (state.step === 'ready') {
    return (
      <p role="status" className="m-0 flex items-start gap-2 text-[16px] font-semibold">
        <Icon as={CircleCheck} className="mt-0.5 flex-none text-earthGreen" />
        {m.invite.fieldReady}
      </p>
    );
  }

  const restart = (
    <Button
      type="submit"
      tone="secondary"
      name="intent"
      value="restart"
      formNoValidate
      disabled={pending}
    >
      {m.login.changeNumber}
    </Button>
  );

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
      {state.step === 'phone' && (
        <>
          <label htmlFor="phone" className="text-[15px] font-semibold">
            {m.login.phone}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            defaultValue={state.phone}
            placeholder="98765 43210"
            className={input}
          />
          <Button type="submit" icon={MessageSquare} disabled={pending}>
            {m.login.getCode}
          </Button>
        </>
      )}
      {state.step === 'code' && (
        <>
          <p className="m-0 text-[16px] font-semibold">{state.phone}</p>
          {state.mockCode && (
            <p className="m-0 rounded-card border-[1.5px] border-line bg-plate px-3 py-2 text-[15px]">
              {fill(m.login.demoCode, { code: state.mockCode })}
            </p>
          )}
          <label htmlFor="otp" className="text-[15px] font-semibold">
            {m.login.code}
          </label>
          <input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={input}
          />
          <Button type="submit" icon={ShieldCheck} disabled={pending}>
            {m.invite.checkCode}
          </Button>
          {restart}
        </>
      )}
      {state.step === 'accept' && (
        <>
          <p className="m-0 text-[16px] font-semibold">{state.phone}</p>
          <label htmlFor="inviteCode" className="text-[15px] font-semibold">
            {m.invite.inviteCode}
          </label>
          <input
            id="inviteCode"
            name="inviteCode"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            required
            className={input}
          />
          <label htmlFor="pin" className="text-[15px] font-semibold">
            {m.pin.new}
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            minLength={6}
            maxLength={6}
            required
            className={input}
          />
          <label htmlFor="repeat" className="text-[15px] font-semibold">
            {m.pin.repeat}
          </label>
          <input
            id="repeat"
            name="repeat"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            minLength={6}
            maxLength={6}
            required
            className={input}
          />
          <Button type="submit" icon={KeyRound} disabled={pending}>
            {m.invite.submit}
          </Button>
          {restart}
        </>
      )}
    </form>
  );
}

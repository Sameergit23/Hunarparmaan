'use client';

import { useActionState } from 'react';
import { Link2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button, Chip } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/fill';
import { checkChain, type ChainState } from './actions';

export function ChainCheck({ sessionId, m }: { sessionId: string; m: Messages }) {
  const [state, run, pending] = useActionState<ChainState>(() => checkChain(sessionId), {});
  const result = state.result;
  return (
    <form action={run} className="flex flex-col gap-3">
      <p className="m-0 text-[15px] text-ink2">{m.session.chainBody}</p>
      <Button type="submit" tone="secondary" icon={Link2} disabled={pending}>
        {m.session.chainCheck}
      </Button>
      <div aria-live="polite" className="flex flex-col gap-2">
        {result?.ok && (
          <Chip tone="done" icon={ShieldCheck}>
            {fill(m.session.chainOk, {
              entries: result.devices.reduce((n, d) => n + d.entries, 0),
              devices: result.devices.length,
            })}
          </Chip>
        )}
        {result &&
          !result.ok &&
          result.devices
            .filter((d) => !d.ok)
            .map((d) => (
              <p key={d.deviceId} className="m-0 flex items-start gap-2 font-semibold">
                <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
                {fill(m.session.chainBroken, { seq: d.failedAtSeq ?? '?', device: d.deviceId })}
              </p>
            ))}
        {state.error && <p className="m-0 font-semibold">{state.error}</p>}
      </div>
    </form>
  );
}

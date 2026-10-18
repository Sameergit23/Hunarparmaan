'use client';

import { useActionState } from 'react';
import { Link2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { verifyAdminChain, type VerifyState } from '@/app/admin/actions';
import { fill } from '@/lib/i18n/fill';
import { Icon } from './icon';
import { Button, Chip } from './wire';

/** "Verify chain" and its result beside it (A1, G1). */
export function VerifyChain({
  labels,
}: {
  labels: { verify: string; verified: string; broken: string };
}) {
  const [state, run, pending] = useActionState<VerifyState>(verifyAdminChain, {});
  const result = state.result;
  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <Button type="submit" tone="secondary" icon={Link2} disabled={pending}>
        {labels.verify}
      </Button>
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        {result?.ok && (
          <Chip tone="done" icon={ShieldCheck}>
            {fill(labels.verified, { n: result.entries })}
          </Chip>
        )}
        {result && !result.ok && (
          <p className="m-0 flex items-start gap-2 font-semibold">
            <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
            {fill(labels.broken, { seq: result.failedAtSeq ?? '?' })}
          </p>
        )}
        {state.error && <p className="m-0 font-semibold">{state.error}</p>}
      </div>
    </form>
  );
}

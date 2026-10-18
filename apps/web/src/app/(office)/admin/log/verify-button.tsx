'use client';

import { useActionState } from 'react';
import { BadgeCheck, Link2, X } from 'lucide-react';
import { Chip, Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/fill';
import { verifyAdminLog, type VerifyState } from '../actions';

/** Re-checks every entry's hash and link, on the server. */
export function VerifyButton({ m }: { m: Messages }) {
  const [state, run, pending] = useActionState<VerifyState>(verifyAdminLog, {});
  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={run}>
        <Button type="submit" tone="secondary" icon={Link2} disabled={pending}>
          {m.admin.log.verify}
        </Button>
      </form>
      <span role="status">
        {state.result?.ok && (
          <Chip tone="done" icon={BadgeCheck}>
            {fill(m.admin.log.verified, { n: state.result.entries })}
          </Chip>
        )}
        {state.result && !state.result.ok && (
          <Chip tone="error" icon={X}>
            {fill(m.admin.log.broken, {
              seq: state.result.failedAtSeq ?? 0,
              reason: state.result.reason ?? '',
            })}
          </Chip>
        )}
        {state.message && <span className="font-semibold">{state.message}</span>}
      </span>
    </div>
  );
}

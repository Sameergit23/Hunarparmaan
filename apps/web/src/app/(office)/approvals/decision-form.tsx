'use client';

import { useActionState } from 'react';
import { BadgeCheck, CircleCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { decide, type DecisionState } from './actions';

export function DecisionForm({
  recommendationId,
  outcome,
  blocked,
  m,
}: {
  recommendationId: string;
  outcome: 'pass' | 'fail';
  blocked: boolean;
  m: Messages;
}) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(
    decide.bind(null, recommendationId),
    {},
  );
  if (state.ok) {
    return (
      <p role="status" className="m-0 flex items-center gap-2 font-semibold">
        <Icon as={CircleCheck} className="text-earthGreen" />
        {state.message}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state.message && (
        <p role="alert" className="m-0 flex items-start gap-2 font-semibold">
          <Icon as={TriangleAlert} className="mt-0.5 flex-none text-phaseRed" />
          {state.message}
        </p>
      )}
      {!blocked && (
        <form action={action}>
          <input type="hidden" name="decision" value="approved" />
          <Button type="submit" icon={BadgeCheck} disabled={pending} className="w-full sm:w-auto">
            {outcome === 'pass' ? m.approvals.approvePass : m.approvals.approveFail}
          </Button>
        </form>
      )}
      <details className="group">
        <summary className="inline-flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-card border-2 border-ink bg-plate px-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
          <Icon as={Undo2} size={20} />
          {m.approvals.return}
        </summary>
        <form action={action} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="decision" value="returned" />
          <label htmlFor={`note-${recommendationId}`} className="text-[15px] font-semibold">
            {m.approvals.noteLabel}
          </label>
          <textarea
            id={`note-${recommendationId}`}
            name="note"
            required
            minLength={3}
            rows={2}
            className="rounded-card border-2 border-ink bg-plate p-3 text-[16px]"
          />
          <Button
            type="submit"
            tone="secondary"
            icon={Undo2}
            disabled={pending}
            className="self-start"
          >
            {m.approvals.return}
          </Button>
        </form>
      </details>
    </div>
  );
}

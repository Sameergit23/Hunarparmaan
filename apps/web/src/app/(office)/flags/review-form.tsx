'use client';

import { useActionState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { reviewFlag, type ReviewState } from './actions';

export function ReviewForm({ flagId, m }: { flagId: string; m: Messages }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    reviewFlag.bind(null, flagId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <span className="flex flex-1 flex-col gap-1">
        <label htmlFor={`note-${flagId}`} className="text-sm font-semibold">
          {m.flags.noteLabel}
        </label>
        <input
          id={`note-${flagId}`}
          name="note"
          required
          minLength={3}
          className="min-h-touch rounded-card border-2 border-ink bg-plate px-3 text-[16px]"
        />
      </span>
      <Button type="submit" tone="secondary" icon={ClipboardCheck} disabled={pending}>
        {m.flags.markReviewed}
      </Button>
      {state.error && <p className="m-0 text-sm font-semibold">{state.error}</p>}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/wire';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/fill';

/** The one-time code, shown once to the admin who created it (ADR 010). */
export function InviteCode({
  invite,
  m,
}: {
  invite: { code: string; expiresAt: string; name: string };
  m: Messages;
}) {
  const [copied, setCopied] = useState(false);
  const until = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(invite.expiresAt));
  return (
    <section
      aria-live="polite"
      className="flex max-w-md flex-col gap-3 rounded-card border-2 border-ink bg-plate p-4"
    >
      <h3 className="m-0 flex items-center gap-2 font-heading text-[20px] font-bold">
        <Icon as={KeyRound} size={20} />
        {fill(m.admin.people.codeTitle, { name: invite.name })}
      </h3>
      <p
        data-testid="invite-code"
        className="m-0 font-heading text-[40px] font-bold leading-none tracking-[0.12em]"
      >
        {invite.code}
      </p>
      <p className="m-0 text-[15px]">
        {fill(m.admin.people.codeBody, { name: invite.name, date: until })}
      </p>
      <Button
        type="button"
        tone="secondary"
        icon={Copy}
        className="self-start"
        onClick={() => {
          void navigator.clipboard?.writeText(invite.code).then(() => setCopied(true));
        }}
      >
        {copied ? m.admin.people.copied : m.admin.people.copy}
      </Button>
    </section>
  );
}

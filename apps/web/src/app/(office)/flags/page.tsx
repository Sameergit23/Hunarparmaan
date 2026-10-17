import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { FlagView } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { Icon } from '@/components/icon';
import { OfficeShell } from '@/components/office-shell';
import { FlagChip, isBlocking } from '@/components/status';
import { Card, Chip, PageTitle, cx } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { flagText } from '@/lib/messages';
import { ReviewForm } from './review-form';

export const metadata = { title: 'Flags' };

export default function FlagsPage() {
  return (
    <OfficeShell active="flags" path="/flags">
      {async ({ m, lang }) => {
        const flags = await apiGet('/v1/flags', z.array(FlagView));
        // Open flags first, blocking ones before suggestions.
        const sorted = [...flags].sort(
          (a, b) =>
            Number(!!a.review) - Number(!!b.review) ||
            Number(isBlocking(b.kind)) - Number(isBlocking(a.kind)),
        );
        return (
          <>
            <PageTitle title={m.flags.title} body={m.flags.body} />
            {sorted.length === 0 && (
              <Card>
                <p className="m-0 text-ink2">{m.flags.none}</p>
              </Card>
            )}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {sorted.map((f) => (
                <li
                  key={f.id}
                  className={cx(
                    'flex flex-col gap-3 rounded-card bg-plate p-4',
                    f.review ? 'border-[1.5px] border-line' : 'border-2 border-ink',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <FlagChip kind={f.kind} m={m} />
                      <Chip tone="neutral">
                        {isBlocking(f.kind) ? m.flags.blocking : m.flags.suggestCheck}
                      </Chip>
                    </span>
                    <span className="text-sm text-ink2">{dateTime(f.createdAt, lang)}</span>
                  </div>
                  <p className="m-0 text-[16px]">{flagText(f, m, lang)}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
                    {(f.workerName || f.assessorName) && (
                      <span>{[f.workerName, f.assessorName].filter(Boolean).join(', ')}</span>
                    )}
                    {f.deviceId && <span className="text-ink2">{f.deviceId}</span>}
                    {f.sessionId && (
                      <Link href={`/sessions/${f.sessionId}`} className="font-semibold">
                        {m.flags.open}
                      </Link>
                    )}
                  </div>
                  {f.review ? (
                    <p className="m-0 flex items-start gap-2 text-[15px]">
                      <Icon as={CircleCheck} className="mt-0.5 flex-none text-earthGreen" />
                      {fill(m.flags.reviewed, { name: f.review.by, note: f.review.note })}
                    </p>
                  ) : (
                    <ReviewForm flagId={f.id} m={m} />
                  )}
                </li>
              ))}
            </ul>
          </>
        );
      }}
    </OfficeShell>
  );
}

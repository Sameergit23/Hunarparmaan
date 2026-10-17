import Link from 'next/link';
import { SessionListItem } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { OfficeShell } from '@/components/office-shell';
import { OutcomeChip, StatusChip } from '@/components/status';
import { Card, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date } from '@/lib/format';
import { fill } from '@/lib/i18n';

export const metadata = { title: 'Sessions' };

export default function SessionsPage() {
  return (
    <OfficeShell active="sessions" path="/sessions">
      {async ({ m, lang }) => {
        const sessions = await apiGet('/v1/sessions', z.array(SessionListItem));
        return (
          <>
            <PageTitle title={m.sessions.title} body={m.sessions.body} />
            {sessions.length === 0 ? (
              <Card>
                <p className="m-0 text-ink2">{m.sessions.none}</p>
              </Card>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="grid gap-3 rounded-card border-[1.5px] border-line bg-plate p-4 no-underline hover:border-ink hover:text-ink md:grid-cols-[1.4fr_1.2fr_1fr_auto] md:items-center"
                    >
                      <span className="flex flex-col">
                        <span className="text-[18px] font-semibold">{s.workerName}</span>
                        <span className="text-sm text-ink2">
                          {m.sessions.assessor}: {s.assessorName}
                        </span>
                      </span>
                      <span className="flex flex-col">
                        <span className="text-[15px]">
                          {s.qualificationTitle[lang]},{' '}
                          {fill(m.sessions.levelShort, { level: s.nsqfLevel })}
                        </span>
                        <span className="text-sm text-ink2">
                          {m.sessions.started} {date(s.startedAt, lang)}
                        </span>
                      </span>
                      <span className="flex flex-col text-[15px]">
                        <span>
                          {m.sessions.evidence}: {s.verifiedEvidenceCount}/{s.evidenceCount}
                        </span>
                        <span className={s.openFlags > 0 ? 'font-semibold' : 'text-ink2'}>
                          {m.sessions.flags}: {s.openFlags}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 md:justify-end">
                        {s.outcome && <OutcomeChip outcome={s.outcome} m={m} />}
                        <StatusChip status={s.status} m={m} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }}
    </OfficeShell>
  );
}

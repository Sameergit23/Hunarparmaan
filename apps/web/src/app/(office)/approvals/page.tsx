import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { PendingRecommendation } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { Icon } from '@/components/icon';
import { OfficeShell } from '@/components/office-shell';
import { OutcomeChip } from '@/components/status';
import { Card, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date, percent } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { blockerText } from '@/lib/messages';
import { DecisionForm } from './decision-form';

export const metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <OfficeShell active="approvals" path="/approvals">
      {async ({ m, lang }) => {
        const pending = await apiGet('/v1/recommendations', z.array(PendingRecommendation));
        return (
          <>
            <PageTitle title={m.approvals.title} body={m.approvals.body} />
            {pending.length === 0 && (
              <Card>
                <p className="m-0 text-ink2">{m.approvals.none}</p>
              </Card>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {pending.map((r) => (
                <Card key={r.id} strong title={r.workerName || m.sessions.workerUnknown}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="text-[16px] font-semibold">
                        {r.qualificationTitle[lang]}, {fill(m.verify.level, { level: r.nsqfLevel })}
                      </span>
                      <span className="text-sm text-ink2">
                        {fill(m.approvals.signed, {
                          name: r.assessorName,
                          date: date(r.signedAt, lang),
                        })}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-heading text-[36px] font-bold leading-none">
                        {percent(r.aggregate, lang)}
                      </span>
                      <OutcomeChip outcome={r.outcome} m={m} />
                    </span>
                  </div>
                  {r.blockers.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-card border-2 border-phaseRed p-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <Icon as={TriangleAlert} className="text-phaseRed" />
                        {m.approvals.blocked}
                      </span>
                      <ul className="m-0 flex flex-col gap-1 pl-5 text-[15px]">
                        {r.blockers.map((b) => {
                          const text = blockerText(b, m, lang);
                          return <li key={text}>{text}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                  <Link href={`/sessions/${r.sessionId}`} className="self-start font-semibold">
                    {m.approvals.view}
                  </Link>
                  <DecisionForm
                    recommendationId={r.id}
                    outcome={r.outcome}
                    blocked={r.blockers.length > 0}
                    m={m}
                  />
                </Card>
              ))}
            </div>
          </>
        );
      }}
    </OfficeShell>
  );
}

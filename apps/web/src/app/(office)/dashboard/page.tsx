import Link from 'next/link';
import { TriangleAlert, UserCheck } from 'lucide-react';
import { AgreementReport, DashboardSummary, FlagView, canRead } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { OfficeShell } from '@/components/office-shell';
import { FlagChip } from '@/components/status';
import { StudyResults } from '@/components/study-results';
import { AiHint, Card, Chip, PageTitle, Stat } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { dateTime, percent } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { flagText } from '@/lib/messages';

export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <OfficeShell active="dashboard" path="/dashboard">
      {async ({ m, lang, user }) => {
        const showFlags = canRead(user.role, 'flags.read');
        const [summary, agreement, flags] = await Promise.all([
          apiGet('/v1/dashboard/summary', DashboardSummary),
          apiGet('/v1/dashboard/agreement', AgreementReport),
          showFlags ? apiGet('/v1/flags', z.array(FlagView)) : Promise.resolve([]),
        ]);
        const openFlags = flags.filter((f) => !f.review);
        const { rescore } = agreement;

        return (
          <>
            <PageTitle title={m.dashboard.title} body={m.roles[user.role]} />

            <section
              aria-label={m.dashboard.keyNumbers}
              className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
            >
              <Stat
                value={summary.sessions}
                label={m.dashboard.sessions}
                note={fill(m.dashboard.signed, { n: summary.sessionsSigned })}
              />
              <Stat
                value={`${summary.evidenceVerified}/${summary.evidenceTotal}`}
                label={m.dashboard.evidence}
              />
              <Stat value={summary.certificates} label={m.dashboard.certificates} />
              <Stat value={summary.pendingApprovals} label={m.dashboard.pendingApprovals} />
              <Stat value={summary.openFlags} label={m.dashboard.openFlags} />
              <Stat value={summary.workers} label={m.dashboard.workers} />
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
              <Card title={m.dashboard.agreementTitle}>
                <p className="m-0 text-[15px] text-ink2">{m.dashboard.agreementBody}</p>
                <StudyResults rounds={agreement.study} m={m} lang={lang} />
              </Card>

              <div className="flex flex-col gap-6">
                <Card title={m.dashboard.rescoreTitle}>
                  {rescore.done > 0 ? (
                    <div className="flex items-end gap-3">
                      <span className="font-heading text-[40px] font-bold leading-none">
                        {percent(rescore.matches / rescore.done, lang)}
                      </span>
                      <span className="pb-1 text-[15px]">
                        {fill(m.dashboard.rescoreBody, {
                          matches: rescore.matches,
                          done: rescore.done,
                        })}
                      </span>
                    </div>
                  ) : (
                    <p className="m-0 text-ink2">{m.dashboard.rescoreNone}</p>
                  )}
                </Card>

                {showFlags && (
                  <Card title={m.dashboard.flagsTitle}>
                    {openFlags.length === 0 ? (
                      <p className="m-0 text-ink2">{m.dashboard.noFlags}</p>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-3 p-0">
                        {openFlags.slice(0, 4).map((flag) => (
                          <li
                            key={flag.id}
                            className="flex flex-col gap-1 border-b-[1.5px] border-divider pb-3 last:border-0 last:pb-0"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <FlagChip kind={flag.kind} m={m} />
                              <span className="text-sm text-ink2">
                                {dateTime(flag.createdAt, lang)}
                              </span>
                            </div>
                            <span className="text-[15px]">{flagText(flag, m, lang)}</span>
                            {flag.sessionId && (
                              <Link
                                href={`/sessions/${flag.sessionId}`}
                                className="text-[15px] font-semibold"
                              >
                                {[flag.workerName, flag.assessorName].filter(Boolean).join(', ')}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link href="/flags" className="font-semibold">
                      {m.dashboard.flagsAll}
                    </Link>
                  </Card>
                )}
              </div>
            </div>

            {agreement.assessors.length > 0 && (
              <Card title={m.dashboard.assessorsTitle}>
                <p className="m-0 text-[15px] text-ink2">{m.dashboard.assessorsBody}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[15px]">
                    <thead>
                      <tr className="border-b-[1.5px] border-line text-ink2">
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          {m.dashboard.name}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          {m.sessions.title}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          {m.dashboard.rescored}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          {m.dashboard.agreement}
                        </th>
                        <th scope="col" className="py-2 font-semibold">
                          {m.dashboard.status}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {agreement.assessors.map((a) => (
                        <tr key={a.assessorId} className="border-b-[1.5px] border-divider">
                          <th scope="row" className="py-2.5 pr-3 font-semibold">
                            {a.name}
                          </th>
                          <td className="py-2.5 pr-3">{a.sessions}</td>
                          <td className="py-2.5 pr-3">{a.rescored}</td>
                          <td className="py-2.5 pr-3 font-heading text-[20px] font-bold">
                            {a.agreement === null ? '–' : percent(a.agreement, lang)}
                          </td>
                          <td className="py-2.5">
                            {a.outlier ? (
                              <Chip tone="ai" icon={TriangleAlert}>
                                {m.dashboard.outlier}
                              </Chip>
                            ) : a.agreement === null || a.rescored < 3 ? (
                              <span className="text-sm text-ink2">{m.dashboard.tooFew}</span>
                            ) : (
                              <Chip tone="neutral" icon={UserCheck}>
                                {m.dashboard.inLine}
                              </Chip>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {agreement.assessors
                  .filter((a) => a.outlier && a.agreement !== null)
                  .map((a) => (
                    <AiHint
                      key={a.assessorId}
                      title={fill(m.dashboard.outlierHint, {
                        name: a.name,
                        pct: percent(a.agreement ?? 0, lang),
                        n: a.rescored,
                      })}
                      note={m.aiHintOnly}
                    />
                  ))}
              </Card>
            )}
          </>
        );
      }}
    </OfficeShell>
  );
}

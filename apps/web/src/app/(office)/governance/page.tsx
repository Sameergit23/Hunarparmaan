import { GovernanceReport } from '@hunarpramaan/contracts';
import { OfficeShell } from '@/components/office-shell';
import { VerifyChain } from '@/components/verify-chain';
import { Card, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date } from '@/lib/format';
import { fill } from '@/lib/i18n';

export const metadata = { title: 'Governance' };

/**
 * G1 (app flow section 3, FR-32): NCVET sees that organisations manage access,
 * as counts by week, organisation kind and action, and the chain check. No
 * names or numbers reach this page.
 */
export default function GovernancePage() {
  return (
    <OfficeShell active="governance" path="/governance">
      {async ({ m, lang }) => {
        const report = await apiGet('/v1/governance', GovernanceReport);
        return (
          <>
            <PageTitle title={m.admin.governance.title} body={m.admin.governance.body} />
            <VerifyChain labels={m.admin.audit} />
            {report.weeks.length === 0 ? (
              <Card>
                <p className="m-0 text-ink2">{m.admin.governance.none}</p>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {report.weeks.map((week) => (
                  <Card
                    key={week.weekStart}
                    title={fill(m.admin.governance.week, { date: date(week.weekStart, lang) })}
                  >
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {week.rows.map((row) => (
                        <li key={`${row.orgKind} ${row.type}`} className="text-[16px]">
                          {fill(m.admin.governance.line, {
                            kind: m.admin.orgKinds[row.orgKind],
                            count: row.count,
                            action: m.admin.counted[row.type],
                          })}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </>
        );
      }}
    </OfficeShell>
  );
}

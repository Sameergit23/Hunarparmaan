import { AdminEventView } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { OfficeShell } from '@/components/office-shell';
import { Card, PageTitle } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { fill, type Messages } from '@/lib/i18n';
import { VerifyButton } from './verify-button';

export const metadata = { title: 'Admin log' };

/** A reason code in words, when the dictionaries know it; otherwise the code. */
function reasonText(reason: string | null, m: Messages): string | null {
  if (!reason) return null;
  const words: Record<string, string> = {
    ...m.admin.deactivationReason,
    ...m.admin.devices.reasons,
    ...m.admin.organisations.suspendReasons,
    ...m.roles,
  };
  return words[reason] ?? reason;
}

export default function AdminLogPage() {
  return (
    <OfficeShell active="log" path="/admin/log">
      {async ({ m, lang }) => {
        const events = await apiGet('/v1/admin/log', z.array(AdminEventView));
        const newestFirst = [...events].sort((a, b) => b.seq - a.seq);
        return (
          <>
            <PageTitle title={m.admin.log.title} body={m.admin.log.body}>
              <VerifyButton m={m} />
            </PageTitle>
            <Card>
              {newestFirst.length === 0 ? (
                <p className="m-0 text-ink2">{m.admin.log.none}</p>
              ) : (
                <ol className="m-0 list-none p-0">
                  {newestFirst.map((e) => {
                    const reason = reasonText(e.reason, m);
                    return (
                      <li
                        key={e.id}
                        className="grid gap-1 border-b-[1.5px] border-divider py-3 last:border-0 sm:grid-cols-[140px_1fr]"
                      >
                        <span className="flex flex-col text-sm text-ink2">
                          <span>{dateTime(e.at, lang)}</span>
                          <span>{fill(m.admin.log.entry, { seq: e.seq })}</span>
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[16px]">
                            <span className="font-semibold">{m.admin.log.actions[e.type]}</span>
                            {': '}
                            {e.subject.label}
                            {reason && `, ${reason}`}
                          </span>
                          <span className="text-sm text-ink2">
                            {fill(m.admin.log.by, {
                              name: e.actorName,
                              role: m.roles[e.actorRole],
                            })}
                            {e.orgName && `, ${e.orgName}`}
                          </span>
                          <span className="font-mono text-xs text-ink2" title={e.hash}>
                            {e.hash.slice(0, 16)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </>
        );
      }}
    </OfficeShell>
  );
}

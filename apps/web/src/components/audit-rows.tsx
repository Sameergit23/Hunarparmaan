import Link from 'next/link';
import type { AdminLogEntryView } from '@hunarpramaan/contracts';
import { dateTime } from '@/lib/format';
import { fill, type Lang, type Messages } from '@/lib/i18n';

/** Where an entry's subject opens: a person (P2) or a phone (D2). */
function subjectHref(entry: AdminLogEntryView): string | null {
  if (entry.subjectKind === 'account') return `/admin/people/${entry.subjectId}`;
  if (entry.subjectKind === 'device')
    return `/admin/devices/${encodeURIComponent(entry.subjectId)}`;
  return null;
}

/** Admin-log rows (A1): when, who acted, what they did, about whom, and why. */
export function AuditRows({
  entries,
  m,
  lang,
  showOrganisation,
}: {
  entries: AdminLogEntryView[];
  m: Messages;
  lang: Lang;
  showOrganisation: boolean;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {entries.map((e) => {
        const href = subjectHref(e);
        const about = e.subjectName ?? e.subjectId;
        return (
          <li
            key={e.id}
            className="grid gap-1 rounded-card border-[1.5px] border-line bg-plate p-3 md:grid-cols-[11rem_1fr_auto] md:items-center md:gap-4"
          >
            <span className="flex flex-col text-sm text-ink2">
              <span>{dateTime(e.occurredAt, lang)}</span>
              <span>{fill(m.admin.audit.entry, { seq: e.seq })}</span>
            </span>
            <span className="flex flex-col">
              <span className="text-[16px] font-semibold">{m.admin.types[e.type]}</span>
              <span className="text-[15px]">
                {e.actorName
                  ? fill(m.admin.audit.by, { name: e.actorName })
                  : m.admin.audit.bootstrap}
                {', '}
                {href ? (
                  <Link href={href} className="font-semibold">
                    {fill(m.admin.audit.about, { name: about })}
                  </Link>
                ) : (
                  fill(m.admin.audit.about, { name: about })
                )}
              </span>
              {showOrganisation && (
                <span className="text-sm text-ink2">{e.organisationName[lang]}</span>
              )}
            </span>
            <span className="text-[15px]">
              {fill(m.admin.audit.reason, { reason: m.admin.reasons[e.reason] })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

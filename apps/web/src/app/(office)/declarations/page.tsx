import { BookOpen, Check, ClipboardCheck, Clock, Eye, PenLine } from 'lucide-react';
import {
  DeclarationListItem,
  type MappingSuggestionView,
  type QpLabel,
  type RouteDecisionView,
} from '@hunarpramaan/contracts';
import { z } from 'zod';
import { Icon } from '@/components/icon';
import { OfficeShell } from '@/components/office-shell';
import { AiHint, Card, Chip, Label, PageTitle, ThresholdBar } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date, dateTime, percent } from '@/lib/format';
import { fill, type Lang, type Messages } from '@/lib/i18n';

export const metadata = { title: 'Declarations' };

const ROUTE_ICONS = { direct_assessment: ClipboardCheck, bridge_module: BookOpen } as const;

/** "Assistant Electrician, NSQF level 3", or the NQR code for a QP the pack does not have. */
function qpName(qp: QpLabel, m: Messages, lang: Lang) {
  return qp.title && qp.nsqfLevel !== null
    ? `${qp.title[lang]}, ${fill(m.verify.level, { level: qp.nsqfLevel })}`
    : qp.nqrCode;
}

/** The AI's match, in yellow: what it suggests and the coverage per QP with the 70% tick. */
function Suggestion({ s, m, lang }: { s: MappingSuggestionView; m: Messages; lang: Lang }) {
  const threshold = s.routingThreshold;
  const title = s.suggestedQp
    ? fill(m.declarations.suggestion, {
        route: m.declarations.route[s.suggestedRoute],
        qualification: qpName(s.suggestedQp, m, lang),
      })
    : m.declarations.noQualification;
  return (
    <div className="flex flex-col gap-3">
      <Label as="h3">{m.aiSuggests}</Label>
      <AiHint
        title={`${m.aiHint}: ${title}`}
        note={`${m.declarations.engine[s.engine]}, ${fill(m.declarations.pack, { version: s.packVersion })}. ${m.aiHintOnly}`}
      />
      {s.needsReview && (
        <span>
          <Chip tone="ai" icon={Eye}>
            {m.declarations.needsReview}
          </Chip>
        </span>
      )}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {s.coverage.map((c) => {
          const name = qpName(c, m, lang);
          const pct = percent(c.coverage, lang);
          return (
            <li key={c.nqrCode} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold">{name}</span>
                <span className="font-heading text-[24px] font-bold leading-none">{pct}</span>
              </span>
              {threshold !== null && (
                <ThresholdBar
                  value={c.coverage}
                  threshold={threshold}
                  label={fill(m.declarations.coverage, { qualification: name, pct })}
                />
              )}
            </li>
          );
        })}
      </ul>
      {threshold !== null && s.coverage.length > 0 && (
        <p className="m-0 flex items-center gap-2 text-sm text-ink2">
          <span aria-hidden className="inline-block h-[18px] w-[3px] flex-none bg-ink" />
          {fill(m.declarations.thresholdNote, { n: Math.round(threshold * 100) })}
        </p>
      )}
    </div>
  );
}

/** The mobiliser's decision, in black: this is what stands. */
function Decision({
  d,
  suggested,
  m,
  lang,
}: {
  d: RouteDecisionView | null;
  suggested: boolean;
  m: Messages;
  lang: Lang;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border-2 border-ink bg-plate p-3">
      <Label as="h3">{m.declarations.decisionTitle}</Label>
      {d ? (
        <>
          <span className="flex items-center gap-2 text-[18px] font-semibold">
            <Icon as={ROUTE_ICONS[d.route]} size={22} />
            {m.declarations.route[d.route]}
          </span>
          <span className="text-[15px]">{qpName(d.qp, m, lang)}</span>
          <span className="flex flex-col text-sm text-ink2">
            <span>
              {fill(m.declarations.decidedBy, { name: d.decidedBy, date: date(d.decidedAt, lang) })}
            </span>
            {d.origin === 'web' && <span>{m.declarations.online}</span>}
          </span>
          {d.overridden ? (
            <span>
              <Chip tone="neutral" icon={PenLine}>
                {m.declarations.overridden}
              </Chip>
            </span>
          ) : (
            suggested && (
              <span className="flex items-center gap-1.5 text-sm">
                <Icon as={Check} size={16} />
                {m.declarations.sameAsSuggestion}
              </span>
            )
          )}
          {d.reason && (
            <p className="m-0 rounded-card border-[1.5px] border-line bg-ground px-3 py-2 text-[15px]">
              <span className="font-semibold">{m.declarations.reason}: </span>
              {d.reason}
            </p>
          )}
        </>
      ) : (
        <span className="flex items-center gap-2 text-[15px] text-ink2">
          <Icon as={Clock} size={18} />
          {m.declarations.noDecision}
        </span>
      )}
    </div>
  );
}

export default function DeclarationsPage() {
  return (
    <OfficeShell active="declarations" path="/declarations">
      {async ({ m, lang }) => {
        const declarations = await apiGet('/v1/declarations', z.array(DeclarationListItem));
        return (
          <>
            <PageTitle title={m.declarations.title} body={m.declarations.body} />
            {declarations.length === 0 ? (
              <Card>
                <p className="m-0 text-ink2">{m.declarations.none}</p>
              </Card>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {declarations.map((d) => (
                  <li key={d.id}>
                    <Card aria-labelledby={`declaration-${d.id}`}>
                      <div className="flex flex-col">
                        <h2
                          id={`declaration-${d.id}`}
                          className="m-0 font-heading text-[22px] font-bold leading-tight"
                        >
                          {d.workerName}
                        </h2>
                        <span className="text-sm text-ink2">
                          {fill(m.declarations.recorded, {
                            date: dateTime(d.recordedAt, lang),
                            language: m.declarations.language[d.language],
                            source: m.declarations.source[d.source],
                          })}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label as="h3">{m.declarations.transcript}</Label>
                        <p
                          lang={d.language}
                          className="m-0 rounded-card border-[1.5px] border-line bg-ground px-3 py-2 text-[16px]"
                        >
                          “{d.transcript}”
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 md:items-start">
                        {d.suggestion ? (
                          <Suggestion s={d.suggestion} m={m} lang={lang} />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Label as="h3">{m.aiSuggests}</Label>
                            <p className="m-0 text-[15px] text-ink2">
                              {m.declarations.noSuggestion}
                            </p>
                          </div>
                        )}
                        <Decision
                          d={d.decision}
                          suggested={d.suggestion !== null}
                          m={m}
                          lang={lang}
                        />
                      </div>
                    </Card>
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

import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Clock, Hash, TriangleAlert, Video, X } from 'lucide-react';
import { SessionDetail, type CriterionResult, type EvidenceView } from '@hunarpramaan/contracts';
import { Icon } from '@/components/icon';
import { OfficeShell } from '@/components/office-shell';
import { FlagChip, OutcomeChip, StatusChip } from '@/components/status';
import { AiHint, Card, Chip, Label, ScorePlates, ThresholdBar } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date, dateTime, percent } from '@/lib/format';
import { fill, type Lang, type Messages } from '@/lib/i18n';
import { blockerText, flagText } from '@/lib/messages';
import { ChainCheck } from './chain-check';

export const metadata = { title: 'Session' };

function EvidenceRow({ clip, m, lang }: { clip: EvidenceView; m: Messages; lang: Lang }) {
  const chip =
    clip.check === 'verified' ? (
      <Chip tone="done" icon={BadgeCheck}>
        {m.session.check.verified}
      </Chip>
    ) : clip.check === 'mismatch' ? (
      <Chip tone="error" icon={X}>
        {m.session.check.mismatch}
      </Chip>
    ) : (
      <Chip tone="neutral" icon={Clock}>
        {m.session.check.waiting_upload}
      </Chip>
    );
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-divider pb-2.5 last:border-0 last:pb-0">
      <span className="flex items-center gap-2.5">
        <Icon as={Video} size={20} />
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold">{clip.criterionId}</span>
          <span className="text-sm text-ink2">
            {dateTime(clip.capturedAt, lang)}
            {clip.durationSec
              ? `, ${fill(m.session.seconds, { n: Math.round(clip.durationSec) })}`
              : ''}
          </span>
          <span className="inline-flex items-center gap-1 text-xs tracking-wide text-ink2">
            <Icon as={Hash} size={12} />
            {clip.sha256.slice(0, 10)}…{clip.sha256.slice(-6)}
          </span>
        </span>
      </span>
      {chip}
    </li>
  );
}

function ScoreRow({ c, m, lang }: { c: CriterionResult; m: Messages; lang: Lang }) {
  const raised = c.aiFlags.filter((f) => f.raised);
  return (
    <li className="grid gap-3 border-b-[1.5px] border-divider pb-4 last:border-0 last:pb-0 md:grid-cols-[1fr_220px]">
      <div className="flex flex-col gap-2">
        <span className="flex flex-col">
          <span className="text-[16px] font-semibold leading-snug">{c.text[lang]}</span>
          <span className="text-sm text-ink2">
            {c.criterionId}, {fill(m.session.marks, { n: c.marks })}
          </span>
        </span>
        {raised.map((f) => (
          <AiHint
            key={f.check}
            title={`${m.aiHint}: ${fill(m.session.flagRaised, {
              check: m.aiChecks[f.check] ?? f.check,
              confidence: Math.round(f.confidence * 100),
            })}`}
            note={m.aiHintOnly}
          />
        ))}
        {c.conflictReason && (
          <p className="m-0 rounded-card border-[1.5px] border-line bg-ground px-3 py-2 text-[15px]">
            <span className="font-semibold">{m.session.reason}: </span>
            {c.conflictReason}
          </p>
        )}
        {c.rescore !== null && (
          <span>
            <Chip tone={c.rescore === c.score ? 'neutral' : 'progress'}>
              {m.session.rescore}: {c.rescore}
            </Chip>
          </span>
        )}
      </div>
      {c.score === null ? (
        <span className="text-ink2">{m.session.noScore}</span>
      ) : (
        <ScorePlates value={c.score} labels={m.session.scoreLabel} />
      )}
    </li>
  );
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <OfficeShell active="sessions" path={`/sessions/${id}`}>
      {async ({ m, lang }) => {
        const s = await apiGet(`/v1/sessions/${id}`, SessionDetail);
        const aggregate = s.recommendation?.aggregate ?? null;
        const passMark = s.passPercent / 100;
        return (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/sessions"
                aria-label={m.back}
                className="flex size-11 flex-none items-center justify-center rounded-card border-2 border-ink bg-plate"
              >
                <Icon as={ArrowLeft} size={22} />
              </Link>
              <div className="flex flex-1 flex-col">
                <h1 className="m-0 font-heading text-[28px] font-bold leading-tight sm:text-[34px]">
                  {s.workerName}
                </h1>
                <span className="text-[15px] text-ink2">
                  {s.qualificationTitle[lang]}, {fill(m.verify.level, { level: s.nsqfLevel })}.{' '}
                  {m.sessions.assessor}: {s.assessorName}. {date(s.startedAt, lang)}
                </span>
              </div>
              <span className="flex flex-wrap gap-2">
                {s.outcome && <OutcomeChip outcome={s.outcome} m={m} />}
                <StatusChip status={s.status} m={m} />
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <div className="flex flex-col gap-6">
                <Card strong title={m.session.result}>
                  {aggregate !== null ? (
                    <>
                      <div className="flex items-end justify-between gap-3">
                        <span className="font-heading text-[44px] font-bold leading-none">
                          {percent(aggregate, lang)}
                        </span>
                        <span className="text-[15px] text-ink2">
                          {fill(m.session.passMark, { n: s.passPercent })}
                        </span>
                      </div>
                      <ThresholdBar
                        value={aggregate}
                        threshold={passMark}
                        label={`${percent(aggregate, lang)}, ${fill(m.session.passMark, { n: s.passPercent })}`}
                      />
                      <p className="m-0 flex items-center gap-2 text-sm text-ink2">
                        <span aria-hidden className="inline-block h-[18px] w-[3px] bg-ink" />
                        {m.session.passMarkNote}
                      </p>
                    </>
                  ) : (
                    <p className="m-0 text-ink2">{m.session.notSigned}</p>
                  )}
                  <Label as="h3">{m.session.nosTitle}</Label>
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {s.nos.map((n) => (
                      <li key={n.code} className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[15px] font-semibold">{n.title[lang]}</span>
                          <span className="text-sm text-ink2">
                            {percent(n.fraction, lang)},{' '}
                            {fill(m.session.weight, { n: Math.round(n.weight * 100) })}
                          </span>
                        </span>
                        <ThresholdBar
                          value={n.fraction}
                          threshold={passMark}
                          label={`${n.title[lang]} ${percent(n.fraction, lang)}`}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card title={m.session.scoresTitle}>
                  <ul className="m-0 flex list-none flex-col gap-4 p-0">
                    {s.criteria.map((c) => (
                      <ScoreRow key={c.criterionId} c={c} m={m} lang={lang} />
                    ))}
                  </ul>
                </Card>
              </div>

              <div className="flex flex-col gap-6">
                <Card strong title={m.session.recommendationTitle}>
                  {s.recommendation ? (
                    <>
                      <p className="m-0 text-[15px]">
                        {fill(m.session.signedBy, {
                          name: s.recommendation.signedBy,
                          date: date(s.recommendation.signedAt, lang),
                        })}
                      </p>
                      {s.recommendation.approval && (
                        <p className="m-0 text-[15px]">
                          {fill(m.session.decidedBy, {
                            decision: m.sessions.statusLabel[s.recommendation.approval.decision],
                            name: s.recommendation.approval.by,
                            date: date(s.recommendation.approval.at, lang),
                          })}
                          {s.recommendation.approval.note && (
                            <span className="block text-ink2">
                              {s.recommendation.approval.note}
                            </span>
                          )}
                        </p>
                      )}
                      {s.recommendation.certificateId && (
                        <Link
                          href={`/verify/${s.recommendation.certificateId}`}
                          className="font-semibold"
                        >
                          {fill(m.session.certificate, { id: s.recommendation.certificateId })}
                        </Link>
                      )}
                      {s.recommendation.blockers.length > 0 && !s.recommendation.approval && (
                        <div className="flex flex-col gap-2 rounded-card border-2 border-phaseRed p-3">
                          <span className="flex items-center gap-2 font-semibold">
                            <Icon as={TriangleAlert} className="text-phaseRed" />
                            {m.session.blockers}
                          </span>
                          <ul className="m-0 flex flex-col gap-1 pl-5 text-[15px]">
                            {s.recommendation.blockers.map((b) => {
                              const text = blockerText(b, m, lang);
                              return <li key={text}>{text}</li>;
                            })}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="m-0 text-ink2">{m.session.notSigned}</p>
                  )}
                </Card>

                <Card title={m.session.evidenceTitle}>
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {s.evidence.map((clip) => (
                      <EvidenceRow key={clip.id} clip={clip} m={m} lang={lang} />
                    ))}
                  </ul>
                </Card>

                <Card title={m.session.chainTitle}>
                  <ChainCheck sessionId={s.id} m={m} />
                </Card>

                {s.flags.length > 0 && (
                  <Card title={m.session.flagsTitle}>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {s.flags.map((f) => (
                        <li key={f.id} className="flex flex-col gap-1">
                          <span>
                            <FlagChip kind={f.kind} m={m} />
                          </span>
                          <span className="text-[15px]">{flagText(f, m, lang)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <p className="m-0 text-sm text-ink2">
                  {fill(m.session.pack, { version: s.packVersion })}
                </p>
              </div>
            </div>
          </>
        );
      }}
    </OfficeShell>
  );
}

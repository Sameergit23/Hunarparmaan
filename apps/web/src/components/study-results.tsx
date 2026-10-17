import { Info } from 'lucide-react';
import type { StudyRound } from '@hunarpramaan/contracts';
import { decimal, percent } from '@/lib/format';
import { fill, type Lang, type Messages } from '@/lib/i18n';
import { AgreementChart } from './charts/agreement-chart';
import { Icon } from './icon';
import { Chip } from './wire';

/** Round A vs Round B: chart, then the same numbers as text. */
export function StudyResults({
  rounds,
  m,
  lang,
}: {
  rounds: StudyRound[];
  m: Messages;
  lang: Lang;
}) {
  if (rounds.length === 0) return <p className="m-0 text-ink2">{m.study.none}</p>;
  const label = (round: StudyRound) => (round.round === 'A' ? m.study.roundA : m.study.roundB);
  const demo = rounds.some((r) => r.demo);
  const summary = rounds
    .map((r) => `${label(r)}: ${m.study.kappa} ${decimal(r.fleissKappa, lang)}`)
    .join('; ');
  return (
    <div className="flex flex-col gap-3">
      {demo && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-ink2">
          <Chip tone="neutral" icon={Info}>
            {m.demoNumbers}
          </Chip>
          {m.demoNote}
        </p>
      )}
      <AgreementChart
        ariaLabel={summary}
        kappaLabel={m.study.kappa}
        data={rounds.map((r) => ({
          label: r.round === 'A' ? m.study.shortA : m.study.shortB,
          kappa: r.fleissKappa,
          low: r.kappaCiLow,
          high: r.kappaCiHigh,
          main: r.round === 'B',
        }))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {rounds.map((r) => (
          <div key={r.round} className="flex flex-col gap-2 border-t-[1.5px] border-divider pt-3">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{label(r)}</span>
              <span className="text-sm text-ink2">
                {fill(m.study.raters, { raters: r.raters, clips: r.clips })}
              </span>
            </span>
            <dl className="m-0 grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 text-[15px]">
              <dt>{m.study.kappa}</dt>
              <dd className="m-0 text-right font-heading text-[20px] font-bold">
                {decimal(r.fleissKappa, lang)}
              </dd>
              <dt className="text-sm text-ink2">{m.study.ci}</dt>
              <dd className="m-0 text-right text-sm text-ink2">
                {fill(m.study.range, {
                  low: decimal(r.kappaCiLow, lang),
                  high: decimal(r.kappaCiHigh, lang),
                })}
              </dd>
              <dt>{m.study.alpha}</dt>
              <dd className="m-0 text-right font-heading text-[20px] font-bold">
                {decimal(r.krippendorffAlpha, lang)}
              </dd>
              <dt>{m.study.exact}</dt>
              <dd className="m-0 text-right font-heading text-[20px] font-bold">
                {percent(r.exactAgreement, lang)}
              </dd>
            </dl>
          </div>
        ))}
      </div>
      <p className="m-0 flex items-center gap-2 text-sm text-ink2">
        <Icon as={Info} size={16} />
        {m.study.ciNote}
      </p>
    </div>
  );
}

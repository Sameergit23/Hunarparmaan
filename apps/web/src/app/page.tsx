import { ScanLine, ShieldCheck, UserCheck, WifiOff } from 'lucide-react';
import { StudyRound } from '@hunarpramaan/contracts';
import { z } from 'zod';
import { Icon } from '@/components/icon';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { StudyResults } from '@/components/study-results';
import { Button, Card, Chip, cx } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { getMessages } from '@/lib/i18n';
import { color, type ColorName } from '@/theme/tokens';
import { checkCertificate } from './verify/actions';

async function loadStudy() {
  try {
    return await apiGet('/v1/public/study', z.array(StudyRound), { auth: false });
  } catch {
    return null;
  }
}

const KEY_COLOURS: ColorName[] = ['phaseYellow', 'ink', 'earthGreen', 'phaseRed', 'phaseBlue'];

export default async function Landing() {
  const { m, lang } = await getMessages();
  const study = await loadStudy();
  let step = 0;

  return (
    <>
      <SiteHeader m={m} lang={lang} path="/" />
      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-[18px] pt-6">
        {/* Hero and certificate check */}
        <section className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
            <h1 className="m-0 font-heading text-[clamp(44px,6vw,76px)] font-bold leading-[0.98]">
              {m.tagline}
            </h1>
            <p className="m-0 max-w-2xl text-[18px] leading-relaxed">{m.landing.heroBody}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Chip tone="neutral">{m.landing.pilot}</Chip>
              <span className="inline-flex items-center gap-2 text-[15px] text-ink2">
                <Icon as={WifiOff} size={18} />
                {m.offline}
              </span>
            </div>
          </div>
          <Card strong title={m.landing.verifyTitle} id="verify">
            <p className="m-0 text-[15px] text-ink2">{m.landing.verifyBody}</p>
            <form action={checkCertificate} className="flex flex-col gap-3">
              <label htmlFor="code" className="text-[15px] font-semibold">
                {m.landing.verifyLabel}
              </label>
              <input
                id="code"
                name="code"
                required
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="HP-7K3M9Q2XRT"
                className="min-h-touch rounded-card border-2 border-ink bg-plate px-3 font-heading text-[22px] font-semibold tracking-wide uppercase placeholder:text-line"
              />
              <Button type="submit" icon={ScanLine}>
                {m.landing.verifyButton}
              </Button>
            </form>
          </Card>
        </section>

        {/* How it works: AI steps in yellow, people's steps in black, each also in words */}
        <section aria-labelledby="how" className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-1">
            <h2 id="how" className="m-0 font-heading text-[34px] font-bold">
              {m.landing.howTitle}
            </h2>
            <p className="m-0 text-[17px] text-ink2">{m.landing.howBody}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {m.landing.phases.map((phase) => (
              <Card key={phase.title} title={phase.title}>
                <p className="m-0 text-sm font-semibold text-ink2">{phase.who}</p>
                <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {phase.steps.map((s) => {
                    step += 1;
                    const ai = s.by === 'ai';
                    return (
                      <li
                        key={s.text}
                        className={cx(
                          'flex gap-3 rounded-card border-2 p-3',
                          ai ? 'border-ink bg-phaseYellow' : 'border-ink bg-plate',
                        )}
                      >
                        <span
                          className={cx(
                            'flex size-8 flex-none items-center justify-center rounded-chip font-heading text-[18px] font-bold',
                            ai ? 'border-2 border-ink bg-ground text-ink' : 'bg-ink text-plate',
                          )}
                        >
                          {step}
                        </span>
                        <span className="flex flex-col gap-1">
                          <span className="text-[16px] leading-snug">{s.text}</span>
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                            <Icon as={ai ? ShieldCheck : UserCheck} size={16} />
                            {ai ? m.aiSuggests : m.personDecides}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            ))}
          </div>
        </section>

        {/* Colour key */}
        <section aria-labelledby="colours" className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-1">
            <h2 id="colours" className="m-0 font-heading text-[34px] font-bold">
              {m.landing.colourTitle}
            </h2>
            <p className="m-0 text-[17px] text-ink2">{m.landing.colourBody}</p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5">
            {KEY_COLOURS.map((key) => {
              const entry = m.landing.colours[key as keyof typeof m.landing.colours];
              return (
                <li
                  key={key}
                  className="flex flex-col overflow-hidden rounded-card border-[1.5px] border-line bg-plate"
                >
                  <span
                    aria-hidden
                    className="h-14 border-b-[1.5px] border-line"
                    style={{ background: color[key] }}
                  />
                  <span className="flex flex-col gap-0.5 p-3">
                    <span className="font-heading text-[20px] font-bold">{entry.name}</span>
                    <span className="text-[15px]">{entry.meaning}</span>
                    <span className="text-sm text-ink2">{color[key]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Rater study */}
        <section aria-labelledby="study" className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="flex flex-col gap-2">
            <h2 id="study" className="m-0 font-heading text-[34px] font-bold">
              {m.landing.studyTitle}
            </h2>
            <p className="m-0 text-[17px] text-ink2">{m.landing.studyBody}</p>
          </div>
          <Card>
            {study ? (
              <StudyResults rounds={study} m={m} lang={lang} />
            ) : (
              <p className="m-0 text-ink2">{m.study.none}</p>
            )}
          </Card>
        </section>
      </main>
      <SiteFooter m={m} />
    </>
  );
}

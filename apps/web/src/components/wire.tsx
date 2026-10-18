/**
 * Wire code components (docs/design/wire-code.md). Colours come only from the
 * theme: yellow is an AI hint, black a person's action, green done or
 * verified, red an error. Colour never carries meaning alone.
 */
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Award, type LucideIcon } from 'lucide-react';
import { Icon } from './icon';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

/** Three 4px bands in red, yellow and blue. Every screen starts with it. */
export function BrandStripe() {
  return (
    <div aria-hidden className="grid grid-rows-[4px_4px_4px]">
      <span className="bg-phaseRed" />
      <span className="bg-phaseYellow" />
      <span className="bg-phaseBlue" />
    </div>
  );
}

/** Black tile with the award mark, ending in the same stripe. */
export function LogoTile({ size = 72 }: { size?: number }) {
  return (
    <span
      className="flex flex-col overflow-hidden rounded-card bg-ink text-plate"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="flex flex-1 items-center justify-center">
        <Icon as={Award} size={Math.round(size * 0.47)} />
      </span>
      <span className="grid grid-cols-3" style={{ height: Math.max(4, Math.round(size / 12)) }}>
        <span className="bg-phaseRed" />
        <span className="bg-phaseYellow" />
        <span className="bg-phaseBlue" />
      </span>
    </span>
  );
}

type ButtonTone = 'primary' | 'secondary';
const buttonClass = (tone: ButtonTone, extra?: string) =>
  cx(
    'inline-flex min-h-touch items-center justify-center gap-2 rounded-card border-2 border-ink px-4 text-[17px] font-semibold no-underline',
    tone === 'primary' ? 'bg-ink text-plate hover:text-plate' : 'bg-plate text-ink hover:text-ink',
    'disabled:cursor-not-allowed disabled:border-line disabled:bg-divider disabled:text-ink2',
    extra,
  );

/** Primary is black (one per screen); secondary is plate with a black border. */
export function Button({
  tone = 'primary',
  icon,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { tone?: ButtonTone; icon?: LucideIcon }) {
  return (
    <button className={buttonClass(tone, className)} {...props}>
      {icon && <Icon as={icon} size={20} />}
      {children}
    </button>
  );
}

export function ButtonLink({
  tone = 'secondary',
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { tone?: ButtonTone; icon?: LucideIcon }) {
  return (
    <Link className={buttonClass(tone, className)} {...props}>
      {icon && <Icon as={icon} size={20} />}
      {children}
    </Link>
  );
}

/**
 * An AI hint: yellow, 2px black border, a small round marker. It says what the
 * AI saw; the person's choice sits beside it in black.
 */
export function AiHint({
  title,
  note,
  className,
}: {
  title: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex items-start gap-2.5 rounded-card border-2 border-ink bg-phaseYellow px-3 py-2.5 text-ink',
        className,
      )}
    >
      <span
        aria-hidden
        className="mt-[5px] size-3 flex-none rounded-full border-2 border-ink bg-ground"
      />
      <span className="flex flex-col gap-px">
        <span className="text-[15px] font-semibold leading-snug">{title}</span>
        {note && <span className="text-sm">{note}</span>}
      </span>
    </div>
  );
}

export type ChipTone = 'done' | 'neutral' | 'progress' | 'error' | 'ai';

/** Status chips: green done, black outline neutral, black fill in progress, red error, yellow AI. */
export function Chip({
  tone,
  icon,
  iconClassName,
  children,
}: {
  tone: ChipTone;
  icon?: LucideIcon;
  /** Only for an error state on a neutral chip, such as a lost phone's red icon. */
  iconClassName?: string;
  children: ReactNode;
}) {
  const tones: Record<ChipTone, string> = {
    done: 'bg-earthGreen text-onGreen border-earthGreen',
    neutral: 'bg-transparent text-ink border-ink border-[1.5px]',
    progress: 'bg-ink text-plate border-ink',
    error: 'bg-phaseRed text-onGreen border-phaseRed',
    ai: 'bg-phaseYellow text-ink border-ink border-2',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border px-2.5 py-0.5 text-sm font-semibold',
        tones[tone],
      )}
    >
      {icon && <Icon as={icon} size={15} strokeWidth={2.6} className={iconClassName} />}
      {children}
    </span>
  );
}

/** A card: 2px black for important things, 1.5px line for quiet ones. */
export function Card({
  strong = false,
  title,
  className,
  children,
  ...props
}: ComponentProps<'section'> & { strong?: boolean; title?: ReactNode }) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded-card bg-plate',
        strong ? 'border-2 border-ink' : 'border-[1.5px] border-line',
        className,
      )}
      {...props}
    >
      {title && <CardHeader>{title}</CardHeader>}
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

/** Black header strip with plate text in Rajdhani 600. */
export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="m-0 bg-ink px-4 py-2 font-heading text-[19px] font-semibold text-plate">
      {children}
    </h2>
  );
}

/** Section label: small, secondary ink. */
export function Label({
  children,
  as: Tag = 'h2',
}: {
  children: ReactNode;
  as?: 'h2' | 'h3' | 'span';
}) {
  return <Tag className="m-0 text-[15px] font-semibold text-ink2">{children}</Tag>;
}

/**
 * 12px track; green fill at or above the threshold, line below it, and a 3px
 * black tick at the threshold. The tick's meaning is said in words nearby.
 */
export function ThresholdBar({
  value,
  threshold,
  label,
}: {
  value: number;
  threshold: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div role="img" aria-label={label} className="relative h-3 rounded-full bg-divider">
      <div
        className={cx('h-3 rounded-full', value + 1e-9 >= threshold ? 'bg-earthGreen' : 'bg-line')}
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute -top-[5px] h-[22px] w-[3px] bg-ink"
        style={{ left: `calc(${threshold * 100}% - 1.5px)` }}
      />
    </div>
  );
}

/** Read-only 0/1/2 plates; the given score is black. */
export function ScorePlates({
  value,
  labels,
}: {
  value: number | null;
  labels: Record<'0' | '1' | '2', string>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 self-start">
      {(['0', '1', '2'] as const).map((score) => {
        const chosen = value === Number(score);
        return (
          <div
            key={score}
            aria-current={chosen ? 'true' : undefined}
            className={cx(
              'flex flex-col items-center justify-center rounded-card border-2 border-ink px-1 py-1.5',
              chosen ? 'bg-ink text-plate' : 'bg-plate text-ink',
            )}
          >
            <span className="font-heading text-[26px] font-bold leading-none">{score}</span>
            <span className="text-center text-xs font-semibold">{labels[score]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A key number: Rajdhani 40px over a label. */
export function Stat({
  value,
  label,
  note,
}: {
  value: ReactNode;
  label: string;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border-[1.5px] border-line bg-plate p-4">
      <span className="font-heading text-[40px] font-bold leading-none">{value}</span>
      <span className="text-[15px] font-semibold">{label}</span>
      {note && <span className="text-sm text-ink2">{note}</span>}
    </div>
  );
}

/** Page title in Rajdhani 700, with an optional line under it. */
export function PageTitle({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex max-w-3xl flex-col gap-1">
        <h1 className="m-0 font-heading text-[28px] font-bold leading-tight sm:text-[34px]">
          {title}
        </h1>
        {body && <p className="m-0 text-[15px] text-ink2">{body}</p>}
      </div>
      {children}
    </div>
  );
}

export { cx };

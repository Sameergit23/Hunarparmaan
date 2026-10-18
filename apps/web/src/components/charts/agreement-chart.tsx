'use client';

/**
 * Round A vs Round B agreement (Fleiss' kappa) with 95% CIs. Wire code charts:
 * black for the main series, `line` for the comparison, each labelled on the
 * chart rather than in a colour legend.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { color } from '@/theme/tokens';

export interface AgreementDatum {
  label: string;
  kappa: number;
  low: number;
  high: number;
  main: boolean;
}

export function AgreementChart({
  data,
  ariaLabel,
  kappaLabel,
}: {
  data: AgreementDatum[];
  ariaLabel: string;
  kappaLabel: string;
}) {
  // Each bar is named on the chart with its value, so no colour legend is needed.
  const rows = data.map((d) => ({
    ...d,
    name: `${d.label}  ${d.kappa.toFixed(2)}`,
    error: [d.kappa - d.low, d.high - d.kappa] as [number, number],
  }));
  return (
    <div role="img" aria-label={ariaLabel} className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 18, left: 4 }}
          barCategoryGap={18}
        >
          <CartesianGrid horizontal={false} stroke={color.divider} />
          <XAxis
            type="number"
            domain={[0, 1]}
            ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
            tick={{ fill: color.ink2, fontSize: 13 }}
            axisLine={{ stroke: color.line }}
            tickLine={false}
            label={{
              value: kappaLabel,
              position: 'insideBottom',
              offset: -12,
              fill: color.ink2,
              fontSize: 13,
            }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: color.ink, fontSize: 14, fontWeight: 600 }}
            axisLine={{ stroke: color.line }}
            tickLine={false}
          />
          <Bar dataKey="kappa" isAnimationActive={false} radius={[0, 4, 4, 0]}>
            {rows.map((row) => (
              <Cell key={row.label} fill={row.main ? color.ink : color.line} />
            ))}
            <ErrorBar dataKey="error" direction="x" width={10} strokeWidth={2} stroke={color.ink} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

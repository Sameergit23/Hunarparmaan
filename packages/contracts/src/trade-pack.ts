/**
 * Trade-pack schema v1.0 (README "Trade pack").
 *
 * One versioned JSON bundle per trade carries everything the phone needs
 * offline. Codes and texts come from the QP files on NQR.
 */
import { z } from 'zod';
import { LocalizedText, NqrCode, ScoreValue, Sha256Hex } from './common';
import { TRADE_PACK_SCHEMA_VERSION } from './version';

/** Weights are decimals from the QP file, so allow for rounding when they are summed. */
export const WEIGHT_SUM_TOLERANCE = 1e-6;

const Rubric = z.strictObject({
  '0': LocalizedText,
  '1': LocalizedText,
  '2': LocalizedText,
});

const EvidenceSpec = z
  .discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('video'),
      minSeconds: z.int().positive(),
      maxSeconds: z.int().positive(),
    }),
    z.strictObject({ type: z.literal('photo') }),
  ])
  .refine((e) => e.type !== 'video' || e.minSeconds <= e.maxSeconds, {
    message: 'minSeconds must not exceed maxSeconds',
  });

/** AI check ids such as `ppe.gloves` or `meter.reading`. */
const AiCheckId = z.string().regex(/^[a-z]+(\.[a-z_]+)+$/);

export const Criterion = z.strictObject({
  /** Unique within its qualification; PC numbers restart in each NOS, so prefix them. */
  id: z.string().regex(/^[A-Za-z0-9_./-]+$/),
  text: LocalizedText,
  marks: z.int().positive(),
  /** Hindi, English and Hinglish terms that workers use for this task. */
  glossary: z.array(z.string().trim().min(1)),
  rubric: Rubric,
  evidence: EvidenceSpec,
  aiChecks: z.array(AiCheckId),
});
export type Criterion = z.infer<typeof Criterion>;

export const Nos = z.strictObject({
  code: z.string().trim().min(1),
  title: LocalizedText,
  /** Share of the QP; the weights of a qualification's NOS sum to 1. */
  weight: z.number().gt(0).lte(1),
  criteria: z.array(Criterion).min(1),
});
export type Nos = z.infer<typeof Nos>;

const Percent = z.number().min(0).max(100);

export const PassRule = z.strictObject({
  /** The weighted result must reach this, copied from the QP file. */
  aggregatePercent: Percent,
  /** Optional floor that every NOS must also reach, when the QP sets one. */
  minNosPercent: Percent.optional(),
});
export type PassRule = z.infer<typeof PassRule>;

export const Qualification = z
  .strictObject({
    nqrCode: NqrCode,
    title: LocalizedText,
    nsqfLevel: z.int().min(1).max(8),
    awardingBody: z.string().trim().min(1),
    passRule: PassRule,
    nos: z.array(Nos).min(1),
  })
  .superRefine((q, ctx) => {
    const weightSum = q.nos.reduce((sum, n) => sum + n.weight, 0);
    if (Math.abs(weightSum - 1) > WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({
        code: 'custom',
        path: ['nos'],
        message: `NOS weights must sum to 1, got ${weightSum}`,
      });
    }
    reportDuplicates(
      ctx,
      q.nos.map((n) => n.code),
      ['nos'],
      'NOS code',
    );
    reportDuplicates(
      ctx,
      q.nos.flatMap((n) => n.criteria.map((c) => c.id)),
      ['nos'],
      'criterion id',
    );
  });
export type Qualification = z.infer<typeof Qualification>;

export const CalibrationClip = z.strictObject({
  id: z.string().trim().min(1),
  nqrCode: NqrCode,
  criterionId: z.string().trim().min(1),
  /** The master assessor's reference score (FR-07). */
  masterScore: ScoreValue,
  /** Hash of the clip file, which ships beside the pack and is never in Git. */
  sha256: Sha256Hex.optional(),
});
export type CalibrationClip = z.infer<typeof CalibrationClip>;

export const RoutingPolicy = z
  .strictObject({
    /** NCVET rule: coverage at or above this books a direct assessment. */
    routingThreshold: z.number().gt(0).lte(1),
    /** Coverage inside this band goes to a person for review. */
    reviewBand: z.strictObject({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) }),
  })
  .refine(
    (p) => p.reviewBand.low <= p.routingThreshold && p.routingThreshold <= p.reviewBand.high,
    { message: 'the review band must contain the routing threshold' },
  );
export type RoutingPolicy = z.infer<typeof RoutingPolicy>;

export const TradePack = z
  .strictObject({
    schemaVersion: z.literal(TRADE_PACK_SCHEMA_VERSION),
    pack: z.strictObject({
      id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      /** Calendar version: YYYY.MM.patch, for example 2026.11.0. */
      version: z.string().regex(/^\d{4}\.(0?[1-9]|1[0-2])\.\d+$/),
      /** `draft` packs hold placeholder data and must never reach a real assessment. */
      status: z.enum(['draft', 'released']),
      languages: z
        .array(z.enum(['hi', 'en']))
        .refine((l) => l.includes('hi') && l.includes('en'), 'a pack must cover Hindi and English'),
    }),
    policy: RoutingPolicy,
    qualifications: z.array(Qualification).min(1),
    calibrationClips: z.array(CalibrationClip),
    models: z.strictObject({ asr: z.string().min(1), ppe: z.string().min(1).optional() }),
  })
  .superRefine((pack, ctx) => {
    reportDuplicates(
      ctx,
      pack.qualifications.map((q) => q.nqrCode),
      ['qualifications'],
      'NQR code',
    );
    const criteriaByQp = new Map(
      pack.qualifications.map((q) => [
        q.nqrCode,
        new Set(q.nos.flatMap((n) => n.criteria.map((c) => c.id))),
      ]),
    );
    pack.calibrationClips.forEach((clip, i) => {
      if (!criteriaByQp.get(clip.nqrCode)?.has(clip.criterionId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['calibrationClips', i],
          message: `${clip.nqrCode} has no criterion ${clip.criterionId}`,
        });
      }
    });
  });
export type TradePack = z.infer<typeof TradePack>;

function reportDuplicates(
  ctx: z.RefinementCtx,
  values: readonly string[],
  path: (string | number)[],
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      ctx.addIssue({ code: 'custom', path, message: `duplicate ${label}: ${value}` });
    }
    seen.add(value);
  }
}

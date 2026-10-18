/**
 * AI checks on evidence clips (ADR 012): what the AI looks for in a clip or
 * photo, and the report it returns. The AI service (services/ai), the API, the
 * web app and, later, the phone's on-device detector all share these shapes.
 *
 * Rule 1: every result here is a hint. A check never changes a score, never
 * blocks approval and never decides; people do. A raised check can only add a
 * flag for the agency and send the clip to a master assessor for blind re-scoring.
 */
import { z } from 'zod';
import { MessageParams, Timestamp } from './common';

/** Why a check exists, which decides what a raised result leads to (ADR 012). */
export const VisionCheckGroup = z.enum([
  /** Safety gear the worker should wear or use. */
  'safety_gear',
  /** A dangerous condition in the work area. */
  'hazard',
  /** Whether the clip honestly shows this worker doing this task. */
  'evidence',
  /** Whether the clip is good enough to judge. */
  'quality',
  /** How the work was done (step order, meter reading); needs a vision-language model. */
  'work',
]);
export type VisionCheckGroup = z.infer<typeof VisionCheckGroup>;

interface CheckSpec {
  group: VisionCheckGroup;
  /** Runs on every clip. Otherwise only when the criterion lists it in `aiChecks`. */
  always: boolean;
  /** Runs on a single photo as well as on a video. */
  photo: boolean;
}

/**
 * The catalogue. Ids follow the trade pack's `aiChecks` format. The AI service
 * has one detector per id; an id it cannot run comes back as `unavailable`.
 */
export const VISION_CHECKS = {
  // Safety gear: when the criterion's aiChecks list them.
  'ppe.gloves': { group: 'safety_gear', always: false, photo: true },
  'ppe.helmet': { group: 'safety_gear', always: false, photo: true },
  /** Safety glasses, goggles or a welding shield. */
  'ppe.eye_protection': { group: 'safety_gear', always: false, photo: true },
  /** Safety shoes rather than bare feet, slippers or sandals. */
  'ppe.footwear': { group: 'safety_gear', always: false, photo: true },
  /** Tools with insulated handles. */
  'ppe.insulated_tools': { group: 'safety_gear', always: false, photo: true },

  // Hazards: on every clip, as hints; a flag only where the criterion lists them.
  /** Open wire or a joint left without insulation tape or a connector. */
  'hazard.exposed_conductor': { group: 'hazard', always: true, photo: true },
  /** Water or a wet floor near the electrical work. */
  'hazard.water': { group: 'hazard', always: true, photo: true },
  /** Work on a ladder or at height. */
  'hazard.height': { group: 'hazard', always: true, photo: true },
  /** A cluttered work area or trip hazard. */
  'hazard.clutter': { group: 'hazard', always: true, photo: true },

  // Honest evidence: on every clip.
  /** Nobody, and no hands, in most of the clip. */
  'evidence.no_person': { group: 'evidence', always: true, photo: true },
  /** More than one person at the work: someone else may be doing the task. */
  'evidence.multiple_people': { group: 'evidence', always: true, photo: true },
  /** A screen being filmed, for example a replayed video. */
  'evidence.screen_replay': { group: 'evidence', always: true, photo: true },
  /** The picture hardly changes: a still photo held up to the camera. */
  'evidence.static_image': { group: 'evidence', always: true, photo: false },
  /** The clip does not show electrical work. */
  'evidence.off_task': { group: 'evidence', always: true, photo: true },

  // Clip quality: on every clip.
  'quality.dark': { group: 'quality', always: true, photo: true },
  'quality.blurry': { group: 'quality', always: true, photo: true },
  'quality.shaky': { group: 'quality', always: true, photo: false },
  /** Shorter than the criterion's minimum length. */
  'quality.too_short': { group: 'quality', always: true, photo: false },

  // Work checks (FR-16): listed in the pack, not run yet.
  'step.order': { group: 'work', always: false, photo: false },
  'meter.reading': { group: 'work', always: false, photo: true },
} as const satisfies Record<string, CheckSpec>;

export type VisionCheckId = keyof typeof VISION_CHECKS;
export const VISION_CHECK_IDS = Object.keys(VISION_CHECKS) as [VisionCheckId, ...VisionCheckId[]];
export const VisionCheckId = z.enum(VISION_CHECK_IDS);

export function checkGroup(check: VisionCheckId): VisionCheckGroup {
  return VISION_CHECKS[check].group;
}

/**
 * The checks to run on one piece of evidence: every always-on check, plus the
 * criterion's own `aiChecks` from the trade pack. Ids the catalogue does not
 * know are skipped, so a newer pack never breaks an older server.
 */
export function checksForCriterion(
  aiChecks: readonly string[],
  kind: 'video' | 'photo',
): VisionCheckId[] {
  const wanted = new Set<string>(aiChecks);
  return VISION_CHECK_IDS.filter((id) => {
    const spec = VISION_CHECKS[id];
    if (kind === 'photo' && !spec.photo) return false;
    return spec.always || wanted.has(id);
  });
}

/**
 * - `raised`: the AI thinks the problem is there.
 * - `clear`: the AI looked and did not see it.
 * - `uncertain`: the AI looked but cannot tell.
 * - `not_visible`: what it needs (hands, head, feet) was not in view.
 * - `unavailable`: this check cannot run here (no model installed, or not built yet).
 */
export const VisionCheckStatus = z.enum([
  'raised',
  'clear',
  'uncertain',
  'not_visible',
  'unavailable',
]);
export type VisionCheckStatus = z.infer<typeof VisionCheckStatus>;

const Fraction = z.number().min(0).max(1);

export const VisionCheckResult = z
  .strictObject({
    check: VisionCheckId,
    status: VisionCheckStatus,
    /**
     * How likely the problem is, from 0 to 1 (NFR-07: every AI output shows its
     * confidence). Null when the check did not look (`not_visible`, `unavailable`).
     */
    confidence: Fraction.nullable(),
    /** Frames in which the check could look, out of the frames analysed. */
    framesSeen: z.int().min(0),
    framesTotal: z.int().min(0),
    /** Up to three moments, in seconds from the start, where the problem shows most. */
    moments: z.array(z.number().min(0)).max(3),
    /**
     * Why, as a code plus values that each app words in its own language (rule 7):
     * for example `{ reason: 'bare_hand' }` or `{ brightness: 0.08 }`.
     */
    params: MessageParams,
  })
  .refine(
    (r) => (r.status === 'not_visible' || r.status === 'unavailable') === (r.confidence === null),
    {
      message: 'confidence is null exactly when the check did not look',
      path: ['confidence'],
    },
  )
  .refine((r) => r.framesSeen <= r.framesTotal, {
    message: 'framesSeen cannot exceed framesTotal',
    path: ['framesSeen'],
  });
export type VisionCheckResult = z.infer<typeof VisionCheckResult>;

/** 64-bit DCT perceptual hash of a frame, as 16 lowercase hex digits (FR-15). */
export const FramePhash = z.string().regex(/^[0-9a-f]{16}$/);

export const VisionVideoInfo = z.strictObject({
  kind: z.enum(['video', 'photo']),
  durationSec: z.number().min(0),
  width: z.int().positive(),
  height: z.int().positive(),
  /** Frames decoded for the quality checks, and frames the AI models looked at. */
  framesDecoded: z.int().min(0),
  framesAnalysed: z.int().min(0),
});
export type VisionVideoInfo = z.infer<typeof VisionVideoInfo>;

/** What the AI service returns for one clip or photo (`POST /vision/analyze`). */
export const VisionReport = z.strictObject({
  reportVersion: z.literal(1),
  /** The service and its version, for example `hp-ai 0.1.0`. */
  engine: z.string().min(1),
  /** Each model used, with its version or a hash prefix. */
  models: z.record(z.string(), z.string()),
  video: VisionVideoInfo,
  /** One result for each requested check, in the order requested. */
  checks: z.array(VisionCheckResult),
  phash: z.strictObject({
    algorithm: z.literal('dct64'),
    /** Seconds between hashed frames. */
    intervalSec: z.number().positive(),
    frames: z.array(FramePhash),
  }),
  timingMs: z.int().min(0),
});
export type VisionReport = z.infer<typeof VisionReport>;

/** The `options` part of `POST /vision/analyze`, sent with the clip itself. */
export const VisionAnalyzeOptions = z.strictObject({
  checks: z.array(VisionCheckId).min(1),
  /** The criterion's length limits, for `quality.too_short`. */
  minSeconds: z.int().positive().optional(),
  maxSeconds: z.int().positive().optional(),
});
export type VisionAnalyzeOptions = z.infer<typeof VisionAnalyzeOptions>;

/** The AI checks on one clip, as the dashboard shows them. */
export const EvidenceVision = z.strictObject({
  analysedAt: Timestamp,
  engine: z.string(),
  /** Seeded demo results, not from a real model run. */
  demo: z.boolean(),
  checks: z.array(VisionCheckResult),
});
export type EvidenceVision = z.infer<typeof EvidenceVision>;

/**
 * The on-phone detector (ADR 007, ADR 012), for the mobile app: frames in,
 * results with confidence out. It runs offline at capture, and the server runs
 * the larger models again on every uploaded clip.
 */
export interface DetectorFrame {
  /** Seconds from the start of the clip. */
  timeSec: number;
  width: number;
  height: number;
  /** RGBA pixels, row by row. */
  rgba: Uint8Array;
}

export interface FrameDetector {
  /** Model name and version, stored with each result. */
  readonly model: string;
  /** The checks this detector can run; the rest come back as `unavailable`. */
  readonly checks: readonly VisionCheckId[];
  analyse(
    frames: readonly DetectorFrame[],
    checks: readonly VisionCheckId[],
  ): Promise<VisionCheckResult[]>;
}

/**
 * The AI flags the assessor sees beside the rubric (FR-08). Only results that
 * looked count; `raised` means the problem is there.
 */
export function toAiFlags(
  results: readonly VisionCheckResult[],
  source: 'device' | 'server',
): { check: VisionCheckId; raised: boolean; confidence: number; source: 'device' | 'server' }[] {
  return results.flatMap((r) =>
    (r.status === 'raised' || r.status === 'clear') && r.confidence !== null
      ? [{ check: r.check, raised: r.status === 'raised', confidence: r.confidence, source }]
      : [],
  );
}

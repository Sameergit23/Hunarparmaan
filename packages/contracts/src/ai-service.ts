/**
 * Requests and responses of the AI service (services/ai). Only the API's queue
 * worker calls it (rule 3: the service is stateless and never touches the
 * database). The video checks are in `vision.ts`.
 *
 * Rule 6: the service never computes coverage, routing or results. `/map`
 * says which criteria a declaration covers; the API turns that into coverage
 * and a route with `packages/scoring`, the same code the phone runs.
 */
import { z } from 'zod';
import { Language, LocalizedText, NqrCode } from './common';

const Fraction = z.number().min(0).max(1);

// --- POST /extract: claims in the worker's own words (LLM) -----------------

export const ExtractRequest = z.strictObject({
  /**
   * The confirmed transcript (FR-02). Rule 8: only the transcript goes to an
   * outside AI service, never a name, phone number or eKYC reference.
   */
  transcript: z.string().trim().min(1).max(20_000),
  language: Language,
});
export type ExtractRequest = z.infer<typeof ExtractRequest>;

export const Claim = z.strictObject({
  /** The claim, short and in plain words, for example "fits MCBs in distribution boards". */
  text: z.string().trim().min(1).max(500),
  /** The worker's exact words it rests on; the service checks they are in the transcript. */
  quote: z.string().trim().min(1).max(1_000),
});
export type Claim = z.infer<typeof Claim>;

export const ExtractResponse = z.strictObject({
  claims: z.array(Claim),
  /**
   * `llm`: claims from the language model, every quote checked.
   * `none`: no model configured, or it failed twice; the keyword match stands
   * and the mobiliser reviews (README "Guardrails").
   */
  method: z.enum(['llm', 'none']),
  /** Claims dropped because their quote is not in the transcript. */
  dropped: z.int().min(0),
  /** Why the method is `none`, as a code: `not_configured`, `failed` or `invalid_output`. */
  reason: z.string().nullable(),
  model: z.string().nullable(),
});
export type ExtractResponse = z.infer<typeof ExtractResponse>;

// --- POST /embed: multilingual-e5 sentence vectors --------------------------

export const EmbedRequest = z.strictObject({
  texts: z.array(z.string().trim().min(1).max(2_000)).min(1).max(256),
  /** e5 encodes questions and documents differently. */
  kind: z.enum(['query', 'passage']),
});
export type EmbedRequest = z.infer<typeof EmbedRequest>;

export const EmbedResponse = z.strictObject({
  model: z.string(),
  dimensions: z.int().positive(),
  /** Unit-length vectors, one per text. */
  vectors: z.array(z.array(z.number())),
});
export type EmbedResponse = z.infer<typeof EmbedResponse>;

// --- POST /map: which criteria the declaration covers -----------------------

export const MapCriterion = z.strictObject({
  id: z.string().min(1),
  text: LocalizedText,
  /** Hindi, English and Hinglish words for the task, from the trade pack. */
  glossary: z.array(z.string()),
});
export type MapCriterion = z.infer<typeof MapCriterion>;

export const MapRequest = z.strictObject({
  transcript: z.string().trim().min(1).max(20_000),
  language: Language,
  /** From `/extract`; empty when no claims could be extracted. */
  claims: z.array(Claim),
  qualifications: z
    .array(z.strictObject({ nqrCode: NqrCode, criteria: z.array(MapCriterion).min(1) }))
    .min(1),
});
export type MapRequest = z.infer<typeof MapRequest>;

export const CriterionMatch = z.strictObject({
  nqrCode: NqrCode,
  criterionId: z.string(),
  covered: z.boolean(),
  /** Similarity of the best claim or keyword hit, 0 to 1. */
  score: Fraction,
  /** How sure the service is of `covered`, 0 to 1. */
  confidence: Fraction,
  method: z.enum(['embedding', 'keyword']),
  /** The worker's words that cover it, when covered. */
  quote: z.string().nullable(),
});
export type CriterionMatch = z.infer<typeof CriterionMatch>;

export const MapResponse = z.strictObject({
  /** One entry for every criterion sent, in order. */
  matches: z.array(CriterionMatch),
  /** `embedding` when the e5 model ran; `keyword` when it is not installed. */
  engine: z.enum(['embedding', 'keyword']),
  model: z.string().nullable(),
});
export type MapResponse = z.infer<typeof MapResponse>;

// --- POST /stats/agreement: rater agreement (rater study, FR-14) ------------

export const AgreementRequest = z.strictObject({
  /** One row per clip, one column per rater: a 0/1/2 score, or null if not rated. */
  ratings: z.array(z.array(z.union([z.int().min(0), z.null()]))).min(2),
  /** The possible scores, for example [0, 1, 2]. */
  categories: z.array(z.int().min(0)).min(2),
  /** Scores 0/1/2 are ordered, so alpha is ordinal by default. */
  level: z.enum(['nominal', 'ordinal']).default('ordinal'),
  /** Bootstrap resamples for the 95% confidence intervals; 0 skips them. */
  bootstrap: z.int().min(0).max(10_000).default(1_000),
  seed: z.int().default(2026),
});
export type AgreementRequest = z.input<typeof AgreementRequest>;

const Interval = z.tuple([z.number(), z.number()]);

export const AgreementResponse = z.strictObject({
  items: z.int(),
  raters: z.int(),
  /** Fleiss' kappa over clips that every rater scored. */
  fleissKappa: z.number(),
  fleissKappaCi: Interval.nullable(),
  krippendorffAlpha: z.number(),
  krippendorffAlphaCi: Interval.nullable(),
  /** Share of fully rated clips where every rater gave the same score. */
  exactAgreement: Fraction,
  /** Each rater's agreement with the majority score of the others. */
  perRater: z.array(z.strictObject({ rater: z.int().min(0), agreement: Fraction, rated: z.int() })),
});
export type AgreementResponse = z.infer<typeof AgreementResponse>;

// --- GET /healthz -----------------------------------------------------------

export const AiHealth = z.strictObject({
  status: z.literal('ok'),
  engine: z.string(),
  /** Which models are installed; checks that need a missing one return `unavailable`. */
  models: z.record(z.string(), z.boolean()),
});
export type AiHealth = z.infer<typeof AiHealth>;

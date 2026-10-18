/**
 * HTTP request and response shapes for the API (README "API overview").
 * The phone, the API and the web dashboard all import these, so a change
 * here is a contract change (rule 9).
 */
import { z } from 'zod';
import {
  EntityId,
  EventId,
  LocalizedText,
  MessageParams,
  NqrCode,
  Reason,
  Route,
  ScoreValue,
  Sha256Hex,
  Timestamp,
} from './common';
import { AiFlag, DeviceId, EventPayloads } from './events';
import { Role } from './roles';
import { EvidenceVision, VisionCheckId } from './vision';

/** Indian mobile numbers, with or without +91. */
export const Phone = z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'expected a 10-digit mobile number');
export const Pin = z.string().regex(/^\d{4,6}$/, 'expected a 4 to 6 digit PIN');
export const Otp = z.string().regex(/^\d{6}$/, 'expected the 6-digit code');

/** Error body for every 4xx and 5xx response. */
export const ApiError = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.array(z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

// --- Auth -------------------------------------------------------------------

export const OtpRequest = z.strictObject({ phone: Phone });
export type OtpRequest = z.infer<typeof OtpRequest>;

export const OtpResponse = z.strictObject({
  challengeId: EntityId,
  expiresAt: Timestamp,
  /** Present only when MOCK_INTEGRATIONS=true, so demos work without SMS. */
  mockCode: Otp.optional(),
});
export type OtpResponse = z.infer<typeof OtpResponse>;

export const LoginRequest = z.strictObject({
  challengeId: EntityId,
  otp: Otp,
  pin: Pin,
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * The signed-in account. `orgId` is the organisation it belongs to for good
 * (ADR 010); scope is always derived from it on the server, never from the phone.
 */
export const SessionUser = z.strictObject({
  id: EntityId,
  name: z.string(),
  role: Role,
  orgId: EntityId,
});
export type SessionUser = z.infer<typeof SessionUser>;

export const LoginResponse = z.strictObject({
  token: z.string(),
  expiresAt: Timestamp,
  user: SessionUser,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

// --- Devices ----------------------------------------------------------------

export const RegisterDeviceRequest = z.strictObject({
  deviceId: DeviceId,
  label: z.string().trim().min(1).max(80).optional(),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;

export const RegisterDeviceResponse = z.strictObject({
  deviceId: DeviceId,
  userId: EntityId,
  registeredAt: Timestamp,
});
export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponse>;

// --- Sync pull --------------------------------------------------------------

export const PullItem = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('trade_pack'),
    packId: z.string(),
    version: z.string(),
    sha256: Sha256Hex,
  }),
  z.strictObject({
    type: z.literal('evidence_check'),
    evidenceId: EventId,
    status: z.enum(['verified', 'mismatch']),
  }),
  z.strictObject({
    type: z.literal('rescore_task'),
    taskId: EntityId,
    evidenceId: EventId,
    criterionId: z.string(),
    nqrCode: NqrCode,
  }),
]);
export type PullItem = z.infer<typeof PullItem>;

export const SyncPullResponse = z.strictObject({
  /** Pass back as `?cursor=` on the next pull. */
  cursor: z.string(),
  serverTime: Timestamp,
  items: z.array(PullItem),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponse>;

// --- Evidence ---------------------------------------------------------------

export const EvidenceCompleteResponse = z.strictObject({
  evidenceId: EventId,
  status: z.literal('queued'),
});
export type EvidenceCompleteResponse = z.infer<typeof EvidenceCompleteResponse>;

// --- Decisions made online --------------------------------------------------

/** POST /v1/declarations/:id/override. The reason is always required online. */
export const RouteOverrideRequest = z.strictObject({
  nqrCode: NqrCode,
  route: Route,
  reason: Reason,
});
export type RouteOverrideRequest = z.infer<typeof RouteOverrideRequest>;

/** POST /v1/sessions/:id/sign: the same payload the phone signs offline. */
export const SignRequest = EventPayloads['recommendation.signed'].omit({ sessionId: true });
export type SignRequest = z.infer<typeof SignRequest>;

export const ApprovalDecision = z.enum(['approved', 'returned']);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const ApproveRequest = z
  .strictObject({ decision: ApprovalDecision, note: Reason.optional() })
  .refine((r) => r.decision === 'approved' || r.note !== undefined, {
    message: 'returning a recommendation needs a note',
    path: ['note'],
  });
export type ApproveRequest = z.infer<typeof ApproveRequest>;

export const ApproveResponse = z.strictObject({
  approvalId: EntityId,
  decision: ApprovalDecision,
  certificateId: z.string().nullable(),
});
export type ApproveResponse = z.infer<typeof ApproveResponse>;

export const FlagReviewRequest = z.strictObject({ note: Reason });
export type FlagReviewRequest = z.infer<typeof FlagReviewRequest>;

export const RescoreRequest = z.strictObject({ taskId: EntityId, value: ScoreValue });
export type RescoreRequest = z.infer<typeof RescoreRequest>;

// --- Flags ------------------------------------------------------------------

export const FlagKind = z.enum([
  'chain_broken',
  'clock_drift',
  'mock_gps',
  'geofence',
  'hash_mismatch',
  'reused_clip',
  'result_mismatch',
  'invalid_event',
  /** An AI check on honest evidence was raised (ADR 012): params `check`, `confidence`, `criterionId`. */
  'vision_evidence',
  /** The clip is too dark, blurry or short to judge: params `check`, `criterionId`. */
  'vision_quality',
  /** The assessor gave full marks although the AI saw a problem the criterion checks for. */
  'vision_conflict',
  /** Perceptual hash: nearly the same picture as a clip in another session (FR-15). */
  'similar_clip',
  /** Events synced by an account that was deactivated while offline work was waiting (ADR 010). */
  'account_draining',
  /** Events synced from a phone that was retired or replaced. */
  'device_draining',
  /** Events recorded on a phone after it was reported lost: refused; the session needs re-assessment. */
  'device_lost',
]);
export type FlagKind = z.infer<typeof FlagKind>;

/** Flags that block approval: broken or missing evidence (README "Evidence integrity"). */
export const BLOCKING_FLAGS: readonly FlagKind[] = [
  'chain_broken',
  'hash_mismatch',
  'result_mismatch',
  'invalid_event',
];

export const FlagView = z.strictObject({
  id: EntityId,
  kind: FlagKind,
  params: MessageParams,
  sessionId: EntityId.nullable(),
  evidenceId: EventId.nullable(),
  deviceId: z.string().nullable(),
  /** The same message in English, for logs and API clients. */
  detail: z.string(),
  createdAt: Timestamp,
  workerName: z.string().nullable(),
  assessorName: z.string().nullable(),
  review: z.strictObject({ note: z.string(), by: z.string(), at: Timestamp }).nullable(),
});
export type FlagView = z.infer<typeof FlagView>;

// --- Sessions ---------------------------------------------------------------

export const SessionStatus = z.enum(['in_progress', 'signed', 'approved', 'returned']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SessionListItem = z.strictObject({
  id: EntityId,
  workerName: z.string(),
  assessorName: z.string(),
  nqrCode: NqrCode,
  qualificationTitle: LocalizedText,
  nsqfLevel: z.int(),
  startedAt: Timestamp,
  evidenceCount: z.int(),
  verifiedEvidenceCount: z.int(),
  openFlags: z.int(),
  status: SessionStatus,
  outcome: z.enum(['pass', 'fail']).nullable(),
});
export type SessionListItem = z.infer<typeof SessionListItem>;

export const EvidenceView = z.strictObject({
  id: EventId,
  criterionId: z.string(),
  sha256: Sha256Hex,
  mimeType: z.string(),
  durationSec: z.number().nullable(),
  capturedAt: Timestamp,
  check: z.enum(['waiting_upload', 'verified', 'mismatch']),
  /** The AI checks on this clip (hints only), or null before they have run. */
  vision: EvidenceVision.nullable(),
});
export type EvidenceView = z.infer<typeof EvidenceView>;

export const CriterionResult = z.strictObject({
  criterionId: z.string(),
  nosCode: z.string(),
  text: LocalizedText,
  marks: z.int(),
  score: ScoreValue.nullable(),
  aiFlags: z.array(AiFlag),
  conflictReason: z.string().nullable(),
  rescore: ScoreValue.nullable(),
});
export type CriterionResult = z.infer<typeof CriterionResult>;

export const NosResult = z.strictObject({
  code: z.string(),
  title: LocalizedText,
  weight: z.number(),
  fraction: z.number(),
});
export type NosResult = z.infer<typeof NosResult>;

export const BlockerCode = z.enum([
  /** The session's worker has not synced from the mobiliser's phone yet. */
  'worker_unknown',
  'no_evidence',
  'clip_unchecked',
  'clip_mismatch',
  'chain_broken',
  'stored_chain',
  'invalid_event',
  'result_mismatch',
  'missing_data',
]);
export type BlockerCode = z.infer<typeof BlockerCode>;

/** Why a recommendation cannot be approved yet, as a code plus values. */
export const Blocker = z.strictObject({ code: BlockerCode, params: MessageParams });
export type Blocker = z.infer<typeof Blocker>;

export const RecommendationView = z.strictObject({
  id: EntityId,
  outcome: z.enum(['pass', 'fail']),
  aggregate: z.number(),
  signedBy: z.string(),
  signedAt: Timestamp,
  approval: z
    .strictObject({
      decision: ApprovalDecision,
      note: z.string().nullable(),
      by: z.string(),
      at: Timestamp,
    })
    .nullable(),
  certificateId: z.string().nullable(),
  /** Reasons approval is blocked; empty when it can be approved. */
  blockers: z.array(Blocker),
});
export type RecommendationView = z.infer<typeof RecommendationView>;

export const SessionDetail = SessionListItem.extend({
  packVersion: z.string(),
  passPercent: z.number(),
  deviceIds: z.array(z.string()),
  evidence: z.array(EvidenceView),
  criteria: z.array(CriterionResult),
  nos: z.array(NosResult),
  recommendation: RecommendationView.nullable(),
  flags: z.array(FlagView),
});
export type SessionDetail = z.infer<typeof SessionDetail>;

export const PendingRecommendation = z.strictObject({
  id: EntityId,
  sessionId: EntityId,
  workerName: z.string(),
  assessorName: z.string(),
  qualificationTitle: LocalizedText,
  nsqfLevel: z.int(),
  outcome: z.enum(['pass', 'fail']),
  aggregate: z.number(),
  signedAt: Timestamp,
  blockers: z.array(Blocker),
});
export type PendingRecommendation = z.infer<typeof PendingRecommendation>;

// --- Audit ------------------------------------------------------------------

export const ChainVerification = z.strictObject({
  sessionId: EntityId,
  ok: z.boolean(),
  checkedAt: Timestamp,
  devices: z.array(
    z.strictObject({
      deviceId: z.string(),
      entries: z.int(),
      ok: z.boolean(),
      failedAtSeq: z.int().nullable(),
      reason: z.string().nullable(),
    }),
  ),
});
export type ChainVerification = z.infer<typeof ChainVerification>;

// --- Dashboard --------------------------------------------------------------

export const DashboardSummary = z.strictObject({
  workers: z.int(),
  sessions: z.int(),
  sessionsSigned: z.int(),
  certificates: z.int(),
  pendingApprovals: z.int(),
  openFlags: z.int(),
  evidenceVerified: z.int(),
  evidenceTotal: z.int(),
  /** AI checks on clips (ADR 012): counts only, so NCVET may see them. */
  vision: z.strictObject({
    clipsAnalysed: z.int(),
    /** Clips where at least one check was raised. */
    clipsWithHints: z.int(),
    /** Clips given full marks although a check the criterion lists was raised. */
    conflicts: z.int(),
    /** For each check raised at least once: on how many clips. */
    byCheck: z.array(z.strictObject({ check: VisionCheckId, clips: z.int() })),
  }),
});
export type DashboardSummary = z.infer<typeof DashboardSummary>;

export const StudyRound = z.strictObject({
  round: z.enum(['A', 'B']),
  /** Round A is unassisted; Round B uses rubrics, calibration and AI hints. */
  label: z.string(),
  fleissKappa: z.number(),
  kappaCiLow: z.number(),
  kappaCiHigh: z.number(),
  krippendorffAlpha: z.number(),
  exactAgreement: z.number(),
  raters: z.int(),
  clips: z.int(),
  /** True for seeded placeholder numbers, before the real study runs. */
  demo: z.boolean(),
});
export type StudyRound = z.infer<typeof StudyRound>;

export const AssessorRow = z.strictObject({
  assessorId: EntityId,
  name: z.string(),
  sessions: z.int(),
  rescored: z.int(),
  /** Share of blind re-scores that match the assessor's score; null with none yet. */
  agreement: z.number().nullable(),
  outlier: z.boolean(),
});
export type AssessorRow = z.infer<typeof AssessorRow>;

export const AgreementReport = z.strictObject({
  study: z.array(StudyRound),
  rescore: z.strictObject({ tasks: z.int(), done: z.int(), matches: z.int() }),
  assessors: z.array(AssessorRow),
});
export type AgreementReport = z.infer<typeof AgreementReport>;

// --- Rescoring --------------------------------------------------------------

/** A blind re-score task: it never shows the original score. */
export const RescoreTask = z.strictObject({
  taskId: EntityId,
  evidenceId: EventId,
  criterionId: z.string(),
  criterionText: LocalizedText,
  rubric: z.strictObject({ '0': LocalizedText, '1': LocalizedText, '2': LocalizedText }),
  reason: z.enum(['sample', 'flagged']),
  createdAt: Timestamp,
});
export type RescoreTask = z.infer<typeof RescoreTask>;

// --- Certificates -----------------------------------------------------------

export const CertificateVerification = z.discriminatedUnion('valid', [
  z.strictObject({
    valid: z.literal(true),
    certificateId: z.string(),
    /** First name and last initial only (DPDP: show no more than needed). */
    holder: z.string(),
    nqrCode: NqrCode,
    qualificationTitle: LocalizedText,
    nsqfLevel: z.int(),
    awardingBody: z.string(),
    issuedAt: Timestamp,
  }),
  z.strictObject({ valid: z.literal(false), certificateId: z.string() }),
]);
export type CertificateVerification = z.infer<typeof CertificateVerification>;

// --- Exports ----------------------------------------------------------------

export const SidhExport = z.strictObject({
  exportedAt: Timestamp,
  mock: z.literal(true),
  records: z.array(
    z.strictObject({
      certificateId: z.string(),
      nqrCode: NqrCode,
      nsqfLevel: z.int(),
      result: z.literal('pass'),
      aggregatePercent: z.number(),
      ekycRef: z.string(),
      issuedAt: Timestamp,
    }),
  ),
});
export type SidhExport = z.infer<typeof SidhExport>;

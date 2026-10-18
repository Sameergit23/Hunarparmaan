/**
 * HTTP request and response shapes for the API (README "API overview").
 * The phone, the API and the web dashboard all import these, so a change
 * here is a contract change (rule 9).
 */
import { z } from 'zod';
import {
  EntityId,
  EventId,
  Language,
  LocalizedText,
  NqrCode,
  Reason,
  Route,
  ScoreValue,
  Sha256Hex,
  Timestamp,
} from './common';
import { AiFlag, DeviceId, EventPayloads } from './events';
import { Role } from './roles';

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

/**
 * `error.code` values for accounts, phones and admin actions (ADR 010). Each
 * app words them in Hindi and English (rule 7). A record outside the caller's
 * scope is plain `not_found`, so its existence is not revealed.
 */
export const AdminErrorCode = z.enum([
  /** 401: the account was deactivated. Work recorded offline before then still syncs. */
  'account_deactivated',
  /** 401: the token's version is older than the account's, for example after a PIN reset. */
  'token_revoked',
  /** 401: too many wrong PINs; the lockout lasts at most an hour. */
  'account_locked',
  /** 429: too many codes asked for from one phone number or one IP address. */
  'rate_limited',
  /** 403: approvals and admin actions need the PIN again. */
  'step_up_required',
  /** 403: the account's organisation is suspended. */
  'organisation_suspended',
  /** 403: the phone was reported lost; nothing from it is accepted after that time. */
  'device_lost',
  /** 403: the phone was retired or replaced; recorded work still syncs, nothing new starts. */
  'device_retired',
  /** 403: nobody acts on their own account. */
  'self_action',
  /** 409: the organisation's last active admin cannot be deactivated. */
  'last_admin',
  /** 403: GRANTABLE_ROLES does not let this admin grant the role. */
  'role_not_grantable',
  /** 409: ROLES_BY_ORG_KIND does not let this kind of organisation hold the role. */
  'role_not_in_org',
  /** 409: another active account already uses this phone number. */
  'phone_in_use',
  /** 403: only whoever deactivated an account, or a higher authority, may reactivate it. */
  'not_issuer',
  /** 403: a trade-pack version needs two people: its uploader cannot release it. */
  'uploader_cannot_release',
  /** 400: the invite or PIN-reset code is wrong, used or expired. */
  'invite_invalid',
]);
export type AdminErrorCode = z.infer<typeof AdminErrorCode>;

/**
 * `error.code` values for signing up and in, beside the account codes above
 * (`account_locked`, `rate_limited`, `token_revoked`, `phone_in_use`). Each app
 * words them in Hindi and English (rule 7).
 */
export const AuthErrorCode = z.enum([
  /** 400: a new PIN breaks a rule in `pin.ts`; `details` holds `length` or `easy`. */
  'pin_rejected',
  /** 403: only workers reset their own PIN with an SMS code; staff ask their admin. */
  'pin_reset_by_admin',
  /** 403: the current PIN is wrong when changing it. Not 401: the person is still signed in. */
  'wrong_pin',
]);
export type AuthErrorCode = z.infer<typeof AuthErrorCode>;

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

/** A random, single-use proof that someone just entered the right SMS code. */
export const Ticket = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'expected a sign-in ticket');

/** POST /v1/auth/otp/verify: check the SMS code on its own, before the PIN. */
export const OtpVerifyRequest = z.strictObject({ challengeId: EntityId, otp: Otp });
export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequest>;

/**
 * Whether the number has an account. It is told only after the code proves the
 * person holds the number, so asking for a code still reveals nothing.
 * `invited`: an admin invited the number and it has no account yet.
 */
export const AccountState = z.enum(['existing', 'invited', 'none']);
export type AccountState = z.infer<typeof AccountState>;

export const OtpVerifyResponse = z.strictObject({
  /** Lasts 10 minutes, until it is used to sign in, sign up or reset the PIN. */
  ticket: Ticket,
  expiresAt: Timestamp,
  account: AccountState,
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponse>;

/** The web's one-step sign-in: a wrong code or PIN gets one message that never says which. */
export const CodeLoginRequest = z.strictObject({
  challengeId: EntityId,
  otp: Otp,
  pin: Pin,
});
export type CodeLoginRequest = z.infer<typeof CodeLoginRequest>;

/** The phone's second step, after `otp/verify`. */
export const TicketLoginRequest = z.strictObject({ ticket: Ticket, pin: Pin });
export type TicketLoginRequest = z.infer<typeof TicketLoginRequest>;
export const LoginRequest = z.union([CodeLoginRequest, TicketLoginRequest]);
export type LoginRequest = z.infer<typeof LoginRequest>;

/** One account, one organisation, one role, for good (ADR 010). */
export const SessionUser = z.strictObject({
  id: EntityId,
  name: z.string(),
  role: Role,
  organisationId: EntityId,
});
export type SessionUser = z.infer<typeof SessionUser>;

export const LoginResponse = z.strictObject({
  token: z.string(),
  expiresAt: Timestamp,
  user: SessionUser,
  /** The sign-in before this one, shown as "Last sign-in"; null the first time. */
  previousSignInAt: Timestamp.nullable(),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

/**
 * POST /v1/auth/register: a worker signs up on their own phone (ADR 012). Only
 * for a number with no account; staff accounts come from invites (ADR 010).
 */
export const RegisterRequest = z.strictObject({
  ticket: Ticket,
  pin: Pin,
  name: z.string().trim().min(1).max(120),
  language: Language,
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const RegisterResponse = LoginResponse.extend({
  /** The worker record for the phone's events: the one a mobiliser made for this number, or new. */
  workerId: EntityId,
  /** True when a mobiliser had already registered this number, so the account took that record. */
  claimed: z.boolean(),
});
export type RegisterResponse = z.infer<typeof RegisterResponse>;

/** POST /v1/auth/pin: change the PIN while signed in. Other sign-ins end. */
export const ChangePinRequest = z.strictObject({ currentPin: Pin, newPin: Pin });
export type ChangePinRequest = z.infer<typeof ChangePinRequest>;

/** POST /v1/auth/pin/reset: a worker who forgot their PIN, after a fresh SMS code. */
export const ResetPinRequest = z.strictObject({ ticket: Ticket, newPin: Pin });
export type ResetPinRequest = z.infer<typeof ResetPinRequest>;

/** A long random key that renews a phone's sign-in ("remember this phone"). */
export const RenewalKey = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'expected a renewal key');

/** POST /v1/auth/renewal-key: for a field role, on a phone bound to the account. */
export const RenewalKeyRequest = z.strictObject({ deviceId: DeviceId });
export type RenewalKeyRequest = z.infer<typeof RenewalKeyRequest>;

export const RenewalKeyResponse = z.strictObject({
  renewalKey: RenewalKey,
  /** 30 days on; each renewal replaces the key and starts the 30 days again. */
  expiresAt: Timestamp,
});
export type RenewalKeyResponse = z.infer<typeof RenewalKeyResponse>;

/** POST /v1/auth/refresh: a new sign-in for the phone, and a new key in place of the old. */
export const RefreshRequest = z.strictObject({ deviceId: DeviceId, renewalKey: RenewalKey });
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const RefreshResponse = LoginResponse.extend({ renewal: RenewalKeyResponse });
export type RefreshResponse = z.infer<typeof RefreshResponse>;

// --- Staff invites (ADR 010) ------------------------------------------------

/** Digits only, so it is easy to say and type. Shown to the inviting admin once. */
export const InviteCode = z.string().regex(/^\d{8}$/, 'expected the 8-digit invite code');

/** POST /v1/admin/invites: which roles an admin may invite is GRANTABLE_ROLES. */
export const CreateInviteRequest = z.strictObject({
  phone: Phone,
  name: z.string().trim().min(1).max(120),
  role: Role,
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

export const CreateInviteResponse = z.strictObject({
  inviteId: EntityId,
  /** Given to the person face to face or by phone. Never sent by SMS. */
  code: InviteCode,
  /** 72 hours on. */
  expiresAt: Timestamp,
});
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>;

/** POST /v1/auth/invite/accept: after `otp/verify` says `invited`. */
export const AcceptInviteRequest = z.strictObject({
  ticket: Ticket,
  inviteCode: InviteCode,
  pin: Pin,
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

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
]);
export type FlagKind = z.infer<typeof FlagKind>;

/** Flags that block approval: broken or missing evidence (README "Evidence integrity"). */
export const BLOCKING_FLAGS: readonly FlagKind[] = [
  'chain_broken',
  'hash_mismatch',
  'result_mismatch',
  'invalid_event',
];

/**
 * Values for a message, so each app words it in Hindi or English (rule 7):
 * for example `{ criterionId: 'L3-N1.PC1', metres: 900 }` for a geofence flag.
 */
export const MessageParams = z.record(z.string(), z.union([z.string(), z.number()]));
export type MessageParams = z.infer<typeof MessageParams>;

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

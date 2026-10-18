/**
 * PostgreSQL schema. Rule 4: tables marked "append-only" accept INSERT only;
 * migration 0001 adds a trigger that rejects UPDATE and DELETE on them.
 * A correction is a new row, never an edit.
 *
 * `audit_entries` is the source of truth: every phone event, exactly as
 * synced and hash-chained. The other append-only tables are projections of
 * those events (or of online actions), written in the same transaction.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  Actor,
  AiFlag,
  GeoPoint,
  LocalizedText,
  MessageParams,
  PassRule,
  Role,
  TradePack,
} from '@hunarpramaan/contracts';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () =>
  at('created_at')
    .notNull()
    .default(sql`now()`);

type Rubric = { '0': LocalizedText; '1': LocalizedText; '2': LocalizedText };

// --- Accounts and devices (mutable) ------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  role: text('role').$type<Role>().notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  /** Goes up when the PIN changes or is reset: older tokens and renewal keys stop working. */
  tokenVersion: integer('token_version').notNull().default(0),
  /** Wrong PINs since the last good sign-in or lockout. */
  failedPinAttempts: integer('failed_pin_attempts').notNull().default(0),
  lockedUntil: at('locked_until'),
  /** Lockouts since the last good sign-in; each one doubles the next, up to an hour. */
  lockouts: integer('lockouts').notNull().default(0),
  /**
   * A worker's own account: their worker record. No foreign key, because the
   * record syncs from a phone after the account exists (rule 2).
   */
  workerId: uuid('worker_id').unique(),
  createdAt: createdAt(),
});

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: at('expires_at').notNull(),
    usedAt: at('used_at'),
    /** A keyed hash of the caller's IP address, for the per-IP limit. Never the address. */
    ipHash: text('ip_hash'),
    /** SHA-256 of the ticket issued once the code is right (`otp/verify`). */
    ticketHash: text('ticket_hash').unique(),
    ticketExpiresAt: at('ticket_expires_at'),
    ticketUsedAt: at('ticket_used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('otp_challenges_phone_created').on(t.phone, t.createdAt),
    index('otp_challenges_ip_created').on(t.ipHash, t.createdAt),
  ],
);

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  label: text('label'),
  registeredAt: at('registered_at')
    .notNull()
    .default(sql`now()`),
  revokedAt: at('revoked_at'),
});

export type AuthEventType =
  | 'signed_in'
  | 'sign_in_failed'
  | 'locked'
  | 'registered'
  | 'pin_changed'
  | 'pin_reset'
  | 'renewal_issued'
  | 'renewed'
  | 'renewal_reused';

/** Append-only. Sign-ins and account security changes (ADR 010). Never a phone number or IP. */
export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').$type<AuthEventType>().notNull(),
    deviceId: text('device_id'),
    occurredAt: at('occurred_at').notNull(),
  },
  (t) => [index('auth_events_user_type_at').on(t.userId, t.type, t.occurredAt)],
);

/**
 * Keys that renew a phone's sign-in ("remember this phone"). Mutable: each use
 * replaces the key, and a PIN change, a revoked phone or a reused key ends them.
 */
export const renewalKeys = pgTable('renewal_keys', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.id),
  /** SHA-256 of the key. The key itself is given to the phone once. */
  keyHash: text('key_hash').notNull().unique(),
  /** The account's token version when the key was issued. */
  tokenVersion: integer('token_version').notNull(),
  createdAt: at('created_at').notNull(),
  expiresAt: at('expires_at').notNull(),
  revokedAt: at('revoked_at'),
  /** The key that replaced this one. Using a replaced key again ends every key on the phone. */
  replacedBy: uuid('replaced_by'),
});

// --- The hash-chained event log (append-only) --------------------------------

export const auditEntries = pgTable(
  'audit_entries',
  {
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
    id: uuid('id').notNull().unique(),
    type: text('type').notNull(),
    actor: jsonb('actor').$type<Actor>().notNull(),
    occurredAt: text('occurred_at').notNull(),
    receivedAt: at('received_at')
      .notNull()
      .default(sql`now()`),
    sessionId: uuid('session_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.seq] }),
    index('audit_entries_session').on(t.sessionId),
  ],
);

// --- Trade packs and QP data -------------------------------------------------

/** Every pack version ever published, immutable; sessions keep the version they used. */
export const tradePacks = pgTable(
  'trade_packs',
  {
    id: text('id').notNull(),
    version: text('version').notNull(),
    status: text('status').$type<'draft' | 'released'>().notNull(),
    sha256: text('sha256').notNull(),
    content: jsonb('content').$type<TradePack>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.id, t.version] })],
);

/** The current pack's QPs, loaded relationally for queries. Reloaded on each publish. */
export const qualifications = pgTable('qualifications', {
  nqrCode: text('nqr_code').primaryKey(),
  packId: text('pack_id').notNull(),
  packVersion: text('pack_version').notNull(),
  title: jsonb('title').$type<LocalizedText>().notNull(),
  nsqfLevel: integer('nsqf_level').notNull(),
  awardingBody: text('awarding_body').notNull(),
  passRule: jsonb('pass_rule').$type<PassRule>().notNull(),
});

export const nos = pgTable(
  'nos',
  {
    nqrCode: text('nqr_code')
      .notNull()
      .references(() => qualifications.nqrCode),
    code: text('code').notNull(),
    title: jsonb('title').$type<LocalizedText>().notNull(),
    weight: doublePrecision('weight').notNull(),
  },
  (t) => [primaryKey({ columns: [t.nqrCode, t.code] })],
);

export const criteria = pgTable(
  'criteria',
  {
    nqrCode: text('nqr_code')
      .notNull()
      .references(() => qualifications.nqrCode),
    id: text('id').notNull(),
    nosCode: text('nos_code').notNull(),
    text: jsonb('text').$type<LocalizedText>().notNull(),
    marks: integer('marks').notNull(),
    rubric: jsonb('rubric').$type<Rubric>().notNull(),
    glossary: jsonb('glossary').$type<string[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.nqrCode, t.id] })],
);

// --- Workers and declarations ------------------------------------------------

export const workers = pgTable('workers', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  language: text('language').$type<'hi' | 'en'>().notNull(),
  /** Rule 8: the eKYC reference only, never an Aadhaar number. */
  ekycRef: text('ekyc_ref'),
  registeredBy: uuid('registered_by')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/** Append-only. */
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey(),
  workerId: uuid('worker_id')
    .notNull()
    .references(() => workers.id),
  noticeVersion: text('notice_version').notNull(),
  language: text('language').notNull(),
  readAloud: boolean('read_aloud').notNull(),
  givenAt: at('given_at').notNull(),
});

/** Append-only. */
export const consentWithdrawals = pgTable('consent_withdrawals', {
  id: uuid('id').primaryKey(),
  consentId: uuid('consent_id')
    .notNull()
    .references(() => consents.id),
  withdrawnAt: at('withdrawn_at').notNull(),
});

/** Append-only. */
export const declarations = pgTable('declarations', {
  id: uuid('id').primaryKey(),
  workerId: uuid('worker_id')
    .notNull()
    .references(() => workers.id),
  language: text('language').notNull(),
  source: text('source').notNull(),
  asrTranscript: text('asr_transcript').notNull(),
  transcript: text('transcript').notNull(),
  recordedAt: at('recorded_at').notNull(),
});

/** Append-only. AI suggestions, never decisions. */
export const mappingResults = pgTable('mapping_results', {
  id: uuid('id').primaryKey(),
  declarationId: uuid('declaration_id')
    .notNull()
    .references(() => declarations.id),
  engine: text('engine').notNull(),
  packVersion: text('pack_version').notNull(),
  results: jsonb('results').notNull(),
  suggestedNqrCode: text('suggested_nqr_code'),
  suggestedRoute: text('suggested_route').notNull(),
  needsReview: boolean('needs_review').notNull(),
  createdAt: at('created_at').notNull(),
});

/** Append-only. The mobiliser's decision; the latest one per declaration stands. */
export const routeDecisions = pgTable('route_decisions', {
  id: uuid('id').primaryKey(),
  declarationId: uuid('declaration_id')
    .notNull()
    .references(() => declarations.id),
  nqrCode: text('nqr_code').notNull(),
  route: text('route').notNull(),
  suggested: jsonb('suggested'),
  reason: text('reason'),
  decidedBy: uuid('decided_by')
    .notNull()
    .references(() => users.id),
  decidedAt: at('decided_at').notNull(),
  origin: text('origin').$type<'device' | 'web'>().notNull(),
});

// --- Assessment --------------------------------------------------------------

/** Append-only. */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  /**
   * No foreign key: the worker is registered on the mobiliser's phone and the
   * session on the assessor's, and the two phones sync in any order (rule 2).
   * Approval waits until the worker has synced (blocker `worker_unknown`).
   */
  workerId: uuid('worker_id').notNull(),
  assessorId: uuid('assessor_id')
    .notNull()
    .references(() => users.id),
  nqrCode: text('nqr_code').notNull(),
  packVersion: text('pack_version').notNull(),
  ekycRef: text('ekyc_ref').notNull(),
  startPhotoSha256: text('start_photo_sha256').notNull(),
  gps: jsonb('gps').$type<GeoPoint>().notNull(),
  deviceId: text('device_id').notNull(),
  startedAt: at('started_at').notNull(),
});

/** Append-only. */
export const calibrationScores = pgTable('calibration_scores', {
  id: uuid('id').primaryKey(),
  calibrationRunId: uuid('calibration_run_id').notNull(),
  clipId: text('clip_id').notNull(),
  criterionId: text('criterion_id').notNull(),
  value: integer('value').notNull(),
  assessorId: uuid('assessor_id')
    .notNull()
    .references(() => users.id),
  recordedAt: at('recorded_at').notNull(),
});

/** Append-only. */
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    criterionId: text('criterion_id').notNull(),
    sha256: text('sha256').notNull(),
    bytes: integer('bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    durationSec: doublePrecision('duration_sec'),
    capturedAt: at('captured_at').notNull(),
    gps: jsonb('gps').$type<GeoPoint>().notNull(),
    deviceId: text('device_id').notNull(),
  },
  (t) => [index('evidence_sha256').on(t.sha256), index('evidence_session').on(t.sessionId)],
);

/** Append-only. The server's re-hash of each uploaded clip. */
export const evidenceChecks = pgTable('evidence_checks', {
  id: uuid('id').primaryKey(),
  evidenceId: uuid('evidence_id')
    .notNull()
    .references(() => evidence.id),
  status: text('status').$type<'verified' | 'mismatch'>().notNull(),
  actualSha256: text('actual_sha256'),
  checkedAt: at('checked_at')
    .notNull()
    .default(sql`now()`),
});

/** Append-only. A correction is a new score that `supersedes` the old one. */
export const scores = pgTable(
  'scores',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    criterionId: text('criterion_id').notNull(),
    value: integer('value').notNull(),
    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),
    aiFlags: jsonb('ai_flags').$type<AiFlag[]>().notNull(),
    conflictReason: text('conflict_reason'),
    supersedes: uuid('supersedes'),
    assessorId: uuid('assessor_id')
      .notNull()
      .references(() => users.id),
    recordedAt: at('recorded_at').notNull(),
  },
  (t) => [index('scores_session').on(t.sessionId)],
);

/** Append-only. Signed by an assessor; a returned one is followed by a new one. */
export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id),
  nqrCode: text('nqr_code').notNull(),
  packVersion: text('pack_version').notNull(),
  outcome: text('outcome').$type<'pass' | 'fail'>().notNull(),
  aggregate: doublePrecision('aggregate').notNull(),
  nosTotals: jsonb('nos_totals').$type<{ nosCode: string; fraction: number }[]>().notNull(),
  scoreEventIds: jsonb('score_event_ids').$type<string[]>().notNull(),
  signedBy: uuid('signed_by')
    .notNull()
    .references(() => users.id),
  signedAt: at('signed_at').notNull(),
  origin: text('origin').$type<'device' | 'web'>().notNull(),
});

/** Append-only. One decision per recommendation, by the awarding body. */
export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey(),
  recommendationId: uuid('recommendation_id')
    .notNull()
    .unique()
    .references(() => recommendations.id),
  decision: text('decision').$type<'approved' | 'returned'>().notNull(),
  note: text('note'),
  decidedBy: uuid('decided_by')
    .notNull()
    .references(() => users.id),
  decidedAt: at('decided_at')
    .notNull()
    .default(sql`now()`),
});

/** Append-only. */
export const certificates = pgTable('certificates', {
  id: text('id').primaryKey(),
  recommendationId: uuid('recommendation_id')
    .notNull()
    .unique()
    .references(() => recommendations.id),
  workerId: uuid('worker_id')
    .notNull()
    .references(() => workers.id),
  nqrCode: text('nqr_code').notNull(),
  issuedAt: at('issued_at')
    .notNull()
    .default(sql`now()`),
});

// --- Integrity flags and re-scoring ------------------------------------------

/** Append-only. Raised by the server's checks; reviewed by the agency. */
export const flags = pgTable(
  'flags',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    sessionId: uuid('session_id'),
    evidenceId: uuid('evidence_id'),
    deviceId: text('device_id'),
    /** Values for the message, so apps can word it in Hindi or English. */
    params: jsonb('params').$type<MessageParams>().notNull().default({}),
    /** The message in English. */
    detail: text('detail').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('flags_session').on(t.sessionId)],
);

/** Append-only. */
export const flagReviews = pgTable('flag_reviews', {
  id: uuid('id').primaryKey(),
  flagId: uuid('flag_id')
    .notNull()
    .unique()
    .references(() => flags.id),
  note: text('note').notNull(),
  reviewedBy: uuid('reviewed_by')
    .notNull()
    .references(() => users.id),
  reviewedAt: at('reviewed_at')
    .notNull()
    .default(sql`now()`),
});

/** Append-only. A random 10% of clips plus every flagged one (FR-13). */
export const rescoreTasks = pgTable(
  'rescore_tasks',
  {
    id: uuid('id').primaryKey(),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    criterionId: text('criterion_id').notNull(),
    reason: text('reason').$type<'sample' | 'flagged'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('rescore_tasks_evidence').on(t.evidenceId)],
);

/** Append-only. The master assessor's blind score. */
export const rescores = pgTable('rescores', {
  id: uuid('id').primaryKey(),
  taskId: uuid('task_id')
    .notNull()
    .unique()
    .references(() => rescoreTasks.id),
  value: integer('value').notNull(),
  masterId: uuid('master_id')
    .notNull()
    .references(() => users.id),
  recordedAt: at('recorded_at')
    .notNull()
    .default(sql`now()`),
});

/** Results of the rater study (Round A and Round B), written by the evaluation pipeline. */
export const studyRounds = pgTable('study_rounds', {
  round: text('round').$type<'A' | 'B'>().primaryKey(),
  label: text('label').notNull(),
  fleissKappa: doublePrecision('fleiss_kappa').notNull(),
  kappaCiLow: doublePrecision('kappa_ci_low').notNull(),
  kappaCiHigh: doublePrecision('kappa_ci_high').notNull(),
  krippendorffAlpha: doublePrecision('krippendorff_alpha').notNull(),
  exactAgreement: doublePrecision('exact_agreement').notNull(),
  raters: integer('raters').notNull(),
  clips: integer('clips').notNull(),
  demo: boolean('demo').notNull(),
  recordedAt: createdAt(),
});

/** Tables that reject UPDATE and DELETE (see migration 0001). */
export const APPEND_ONLY_TABLES = [
  'audit_entries',
  'auth_events',
  'trade_packs',
  'consents',
  'consent_withdrawals',
  'declarations',
  'mapping_results',
  'route_decisions',
  'sessions',
  'calibration_scores',
  'evidence',
  'evidence_checks',
  'scores',
  'recommendations',
  'approvals',
  'certificates',
  'flags',
  'flag_reviews',
  'rescore_tasks',
  'rescores',
] as const;

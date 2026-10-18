/**
 * Sync events v1 (README "Sync, step by step").
 *
 * Every write on the phone is one of these events. Each is also an entry in the
 * device's hash chain (@hunarpramaan/audit): `hash` is the SHA-256 of the
 * event's canonical JSON without `hash`. Events are append-only (rule 4):
 * a correction is a new event, for example a score that `supersedes` another.
 */
import { z } from 'zod';
import { DEVICE_EVENT_TYPES, canPerform, type DeviceEventType } from './authority';
import {
  EntityId,
  EventId,
  GeoPoint,
  Language,
  NqrCode,
  Reason,
  Route,
  ScoreValue,
  Sha256Hex,
  Timestamp,
} from './common';
import { Actor } from './roles';
import { SYNC_PROTOCOL_VERSION } from './version';

export const DeviceId = z.string().regex(/^[A-Za-z0-9_-]{4,64}$/);

const AADHAAR_LIKE = /^\d{4}\s?\d{4}\s?\d{4}$/;

/** Rule 8: store only the eKYC reference, never the Aadhaar number. */
export const EkycRef = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((ref) => !AADHAAR_LIKE.test(ref), {
    message: 'this looks like an Aadhaar number; store only the eKYC reference',
  });

const PackVersion = z.string().min(1);
const CriterionId = z.string().min(1);
const Fraction = z.number().min(0).max(1);

/** An AI flag exactly as the assessor saw it next to the rubric. */
export const AiFlag = z.strictObject({
  check: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/),
  raised: z.boolean(),
  confidence: Fraction,
  source: z.enum(['device', 'server']),
});
export type AiFlag = z.infer<typeof AiFlag>;

/** Payload schema for each phone event type. */
export const EventPayloads = {
  'consent.given': z.strictObject({
    consentId: EntityId,
    workerId: EntityId,
    noticeVersion: z.string().min(1),
    language: Language,
    /** NFR-05: the notice is read aloud in the worker's language. */
    readAloud: z.boolean(),
  }),

  'consent.withdrawn': z.strictObject({ consentId: EntityId, workerId: EntityId }),

  'worker.registered': z.strictObject({
    workerId: EntityId,
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(/^\+?\d{10,13}$/),
    language: Language,
    ekycRef: EkycRef.optional(),
  }),

  'declaration.recorded': z.strictObject({
    declarationId: EntityId,
    workerId: EntityId,
    language: Language,
    source: z.enum(['vosk', 'bhashini', 'typed']),
    /** What speech recognition heard; kept so transcript corrections can be measured. */
    asrTranscript: z.string(),
    /** The transcript after the worker confirmed or corrected it (FR-02). */
    transcript: z.string().trim().min(1),
    audioSha256: Sha256Hex.optional(),
  }),

  'mapping.suggested': z.strictObject({
    declarationId: EntityId,
    packVersion: PackVersion,
    engine: z.enum(['device_keyword', 'server_full']),
    results: z.array(
      z.strictObject({
        nqrCode: NqrCode,
        coverage: Fraction,
        coveredCriteria: z.array(CriterionId),
        confidence: Fraction,
      }),
    ),
    suggestedNqrCode: NqrCode.nullable(),
    suggestedRoute: Route,
    needsReview: z.boolean(),
  }),

  'route.decided': z
    .strictObject({
      declarationId: EntityId,
      nqrCode: NqrCode,
      route: Route,
      suggested: z.strictObject({ nqrCode: NqrCode.nullable(), route: Route }),
      reason: Reason.optional(),
    })
    .refine(
      (p) =>
        p.reason !== undefined ||
        (p.nqrCode === p.suggested.nqrCode && p.route === p.suggested.route),
      { message: 'overriding the suggested QP or route needs a reason (FR-04)', path: ['reason'] },
    ),

  'session.started': z.strictObject({
    sessionId: EntityId,
    workerId: EntityId,
    nqrCode: NqrCode,
    packVersion: PackVersion,
    ekycRef: EkycRef,
    startPhotoSha256: Sha256Hex,
    gps: GeoPoint,
    venueId: EntityId.optional(),
  }),

  'calibration.scored': z.strictObject({
    calibrationRunId: EntityId,
    clipId: z.string().min(1),
    criterionId: CriterionId,
    value: ScoreValue,
  }),

  'evidence.captured': z.strictObject({
    evidenceId: EventId,
    sessionId: EntityId,
    criterionId: CriterionId,
    /** Rule 5: hashed at capture; the server re-hashes the upload and compares. */
    sha256: Sha256Hex,
    bytes: z.int().positive(),
    mimeType: z.enum(['video/mp4', 'image/jpeg']),
    durationSec: z.number().positive().optional(),
    capturedAt: Timestamp,
    gps: GeoPoint,
  }),

  'score.recorded': z
    .strictObject({
      sessionId: EntityId,
      criterionId: CriterionId,
      value: ScoreValue,
      evidenceIds: z.array(EventId),
      aiFlags: z.array(AiFlag),
      /** Required when the score conflicts with a raised flag (FR-08). */
      conflictReason: Reason.optional(),
      /** The earlier score this one corrects. */
      supersedes: EventId.optional(),
    })
    .refine((p) => p.conflictReason !== undefined || !conflictsWithFlags(p.value, p.aiFlags), {
      message: 'full marks despite a raised AI flag needs a one-line reason (FR-08)',
      path: ['conflictReason'],
    }),

  'recommendation.signed': z.strictObject({
    recommendationId: EntityId,
    sessionId: EntityId,
    nqrCode: NqrCode,
    packVersion: PackVersion,
    outcome: z.enum(['pass', 'fail']),
    aggregate: Fraction,
    nosTotals: z.array(z.strictObject({ nosCode: z.string().min(1), fraction: Fraction })),
    /** The exact score events this signature covers. */
    scoreEventIds: z.array(EventId).min(1),
  }),
} satisfies Record<DeviceEventType, z.ZodType>;

/**
 * A score conflicts with the AI when the assessor gives full marks although a
 * flag was raised (for example, missing gloves). The assessor may still do so,
 * but must say why.
 */
export function conflictsWithFlags(value: number, flags: readonly AiFlag[]): boolean {
  return value === 2 && flags.some((flag) => flag.raised);
}

const envelope = {
  id: EventId,
  deviceId: DeviceId,
  seq: z.int().positive(),
  prevHash: Sha256Hex,
  hash: Sha256Hex,
  /** Device clock; the server compares it with its own time to flag drift. */
  occurredAt: Timestamp,
  actor: Actor,
};

function eventSchema<T extends DeviceEventType>(type: T) {
  return z.strictObject({ ...envelope, type: z.literal(type), payload: EventPayloads[type] });
}

const eventSchemas = DEVICE_EVENT_TYPES.map(eventSchema) as unknown as [
  ReturnType<typeof eventSchema<DeviceEventType>>,
  ...ReturnType<typeof eventSchema<DeviceEventType>>[],
];

const AnyEvent = z.discriminatedUnion('type', eventSchemas);

export const SyncEvent = AnyEvent.superRefine((event, ctx) => {
  if (!canPerform(event.actor, event.type)) {
    ctx.addIssue({
      code: 'custom',
      path: ['actor'],
      message: `${event.actor.kind === 'system' ? 'system' : event.actor.role} may not create ${event.type}`,
    });
  }
});

/** A typed event, narrowed by `type`. */
export type SyncEventOf<T extends DeviceEventType> = Omit<
  z.infer<typeof AnyEvent>,
  'type' | 'payload'
> & { type: T; payload: z.infer<(typeof EventPayloads)[T]> };
export type SyncEvent = { [T in DeviceEventType]: SyncEventOf<T> }[DeviceEventType];
export type EventPayload<T extends DeviceEventType> = z.infer<(typeof EventPayloads)[T]>;

export const SyncPushRequest = z
  .strictObject({
    protocol: z.literal(SYNC_PROTOCOL_VERSION),
    deviceId: DeviceId,
    /** The device clock when it sent this push; the server flags a large drift (FR-11). */
    sentAt: Timestamp,
    events: z.array(SyncEvent).min(1).max(500),
  })
  .superRefine((req, ctx) => {
    req.events.forEach((event, i) => {
      if (event.deviceId !== req.deviceId) {
        ctx.addIssue({
          code: 'custom',
          path: ['events', i, 'deviceId'],
          message: 'every event must come from the pushing device',
        });
      }
    });
  });
export type SyncPushRequest = z.infer<typeof SyncPushRequest>;

export const SyncAck = z.strictObject({
  id: EventId,
  /** `duplicate` means it was already stored: pushes are idempotent by id (IT-01). */
  status: z.enum(['stored', 'duplicate', 'rejected']),
  reason: z.string().optional(),
});
export type SyncAck = z.infer<typeof SyncAck>;

export const SyncPushResponse = z.strictObject({
  serverTime: Timestamp,
  acks: z.array(SyncAck),
  uploads: z.array(z.strictObject({ evidenceId: EventId, url: z.url(), expiresAt: Timestamp })),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponse>;

/** Building blocks for API tests: a registered worker, a full assessment, uploads, a signature. */
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';
import type {
  EventPayload,
  GeoPoint,
  Route,
  ScoreValue,
  SyncEventOf,
  DeviceEventType,
} from '@hunarpramaan/contracts';
import { qpResult } from '@hunarpramaan/scoring';
import { fakeClip, type SimulatedPhone } from '../dev/simulated-phone';
import { L3, L3_CRITERIA, PACK, type Harness, type TestUser } from './harness';

export const VENUE: GeoPoint = { lat: 22.7196, lng: 75.8577, accuracyM: 6, mocked: false };

export async function push(
  h: Harness,
  user: TestUser,
  phone: SimulatedPhone,
  events: SyncEventOf<DeviceEventType>[],
) {
  const res = await h.http.post('/v1/sync/push').set(user.auth).send(phone.push(events));
  return res;
}

/** Push and expect every event to be stored. */
export async function pushOk(
  h: Harness,
  user: TestUser,
  phone: SimulatedPhone,
  events: SyncEventOf<DeviceEventType>[],
) {
  const res = await push(h, user, phone, events);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.acks.map((a: { status: string }) => a.status)).toEqual(
    events.map(() => 'stored'),
  );
  return res.body;
}

export async function registerWorker(
  h: Harness,
  mobiliser: TestUser,
  phone: SimulatedPhone,
  name = 'Ramesh Kumar',
) {
  const workerId = uuidv4();
  await pushOk(h, mobiliser, phone, [
    phone.event('worker.registered', {
      workerId,
      name,
      phone: '9000000001',
      language: 'hi',
      ekycRef: 'EKYC-MOCK-0001',
    }),
    phone.event('consent.given', {
      consentId: uuidv4(),
      workerId,
      noticeVersion: 'v1',
      language: 'hi',
      readAloud: true,
    }),
  ]);
  return workerId;
}

export const L4 = PACK.qualifications[1]!.nqrCode;
const L4_CRITERIA = PACK.qualifications[1]!.nos.flatMap((n) => n.criteria.map((c) => c.id));

/** What the phone's keyword mapper suggests in `buildDeclaration`: L3 at 78%, a direct assessment. */
export const SUGGESTED = { nqrCode: L3, route: 'direct_assessment' } as const;

/**
 * Build (but don't push) a declaration as the mobiliser's phone records it:
 * the confirmed transcript, the phone's keyword mapping (a system suggestion)
 * and the mobiliser's route decision, which by default accepts the suggestion.
 * `mapped: false` stops after the transcript; `decision: null` before the decision.
 */
export function buildDeclaration(
  phone: SimulatedPhone,
  workerId: string,
  options: {
    mapped?: boolean;
    decision?: { nqrCode: string; route: Route; reason: string } | null;
  } = {},
) {
  const declarationId = uuidv4();
  const events: SyncEventOf<DeviceEventType>[] = [
    phone.event('declaration.recorded', {
      declarationId,
      workerId,
      language: 'hi',
      source: 'vosk',
      asrTranscript: 'das saal se ghar ki wiring karta hoon mcb lagata hoon',
      transcript: '10 saal se ghar ki wiring karta hoon, MCB lagata hoon',
    }),
  ];
  if (options.mapped === false) return { declarationId, events };
  events.push(
    phone.event(
      'mapping.suggested',
      {
        declarationId,
        packVersion: PACK.pack.version,
        engine: 'device_keyword',
        results: [
          {
            nqrCode: L3,
            coverage: 0.78,
            coveredCriteria: L3_CRITERIA.slice(1),
            confidence: 0.7,
          },
          { nqrCode: L4, coverage: 0.52, coveredCriteria: L4_CRITERIA.slice(4), confidence: 0.6 },
        ],
        suggestedNqrCode: SUGGESTED.nqrCode,
        suggestedRoute: SUGGESTED.route,
        needsReview: false,
      },
      { actor: { kind: 'system', service: 'device-mapper' } },
    ),
  );
  if (options.decision === null) return { declarationId, events };
  events.push(
    phone.event('route.decided', {
      declarationId,
      ...(options.decision ?? SUGGESTED),
      suggested: SUGGESTED,
    }),
  );
  return { declarationId, events };
}

export interface Assessment {
  sessionId: string;
  clips: Map<string, { evidenceId: string; bytes: Uint8Array; sha256: string }>;
  scoreEventIds: string[];
  events: SyncEventOf<DeviceEventType>[];
  scores: Map<string, ScoreValue>;
}

/**
 * Build (but don't push) a session: start, one clip per criterion, one score
 * per criterion. `scores` defaults to 2 everywhere.
 */
export function buildAssessment(
  h: Harness,
  phone: SimulatedPhone,
  workerId: string,
  options: {
    scores?: Partial<Record<string, ScoreValue>>;
    gps?: GeoPoint;
    clipLabel?: string;
  } = {},
): Assessment {
  const sessionId = uuidv4();
  const events: SyncEventOf<DeviceEventType>[] = [
    phone.event('session.started', {
      sessionId,
      workerId,
      nqrCode: L3,
      packVersion: PACK.pack.version,
      ekycRef: 'EKYC-MOCK-0001',
      startPhotoSha256: fakeClip(`start ${sessionId}`).sha256,
      gps: VENUE,
    }),
  ];
  const clips: Assessment['clips'] = new Map();
  const scores = new Map<string, ScoreValue>();
  const scoreEventIds: string[] = [];
  for (const criterionId of L3_CRITERIA) {
    h.tick(30_000);
    const clip = fakeClip(`${options.clipLabel ?? sessionId} ${criterionId}`);
    const evidenceId = uuidv7();
    clips.set(criterionId, { evidenceId, ...clip });
    events.push(
      phone.event('evidence.captured', {
        evidenceId,
        sessionId,
        criterionId,
        sha256: clip.sha256,
        bytes: clip.bytes.length,
        mimeType: 'video/mp4',
        durationSec: 42,
        capturedAt: h.deps.now().toISOString(),
        gps: options.gps ?? VENUE,
      }),
    );
    const value = options.scores?.[criterionId] ?? 2;
    scores.set(criterionId, value);
    const score = phone.event('score.recorded', {
      sessionId,
      criterionId,
      value,
      evidenceIds: [evidenceId],
      aiFlags: [],
    });
    scoreEventIds.push(score.id);
    events.push(score);
  }
  return { sessionId, clips, scoreEventIds, events, scores };
}

/** The recommendation payload the phone would sign, computed with the shared scoring code. */
export function signPayload(
  a: Assessment,
  override: Partial<EventPayload<'recommendation.signed'>> = {},
) {
  const qualification = PACK.qualifications[0]!;
  const result = qpResult(qualification, a.scores);
  return {
    recommendationId: uuidv4(),
    sessionId: a.sessionId,
    nqrCode: L3,
    packVersion: PACK.pack.version,
    outcome: result.status === 'pass' ? ('pass' as const) : ('fail' as const),
    aggregate: result.value,
    nosTotals: result.nos.map((n) => ({ nosCode: n.code, fraction: n.fraction })),
    scoreEventIds: a.scoreEventIds,
    ...override,
  };
}

/** Upload every clip through the API and run the server's re-hash. */
export async function uploadAll(h: Harness, assessor: TestUser, a: Assessment) {
  for (const clip of a.clips.values()) {
    const put = await h.http
      .put(`/v1/evidence/${clip.evidenceId}/content`)
      .set(assessor.auth)
      .set('Content-Type', 'video/mp4')
      .send(Buffer.from(clip.bytes));
    expect(put.status).toBe(204);
    const done = await h.http.post(`/v1/evidence/${clip.evidenceId}/complete`).set(assessor.auth);
    expect(done.status).toBe(202);
  }
}

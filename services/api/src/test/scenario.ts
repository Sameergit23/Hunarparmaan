/** Building blocks for API tests: a registered worker, a full assessment, uploads, a signature. */
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';
import type {
  EventPayload,
  GeoPoint,
  Role,
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
  workerPhone = '9000000001',
) {
  const workerId = uuidv4();
  await pushOk(h, mobiliser, phone, [
    phone.event('worker.registered', {
      workerId,
      name,
      phone: workerPhone,
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

// --- Signing up and in ------------------------------------------------------

/** A random mobile number, so tests don't share the per-number code limits. */
export const newPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

/**
 * Ask for an SMS code. The clock moves on first, past the 30-second wait
 * between codes; pass a longer tick to ask again for the same number.
 */
export async function askForCode(h: Harness, phone: string, tickMs = 31_000) {
  h.tick(tickMs);
  const res = await h.http.post('/v1/auth/otp').send({ phone });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { challengeId: string; mockCode: string };
}

/** A code, checked: the ticket for the next step, and whether the number has an account. */
export async function ticketFor(h: Harness, phone: string, tickMs?: number) {
  const { challengeId, mockCode } = await askForCode(h, phone, tickMs);
  const res = await h.http.post('/v1/auth/otp/verify').send({ challengeId, otp: mockCode });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { ticket: string; account: 'existing' | 'invited' | 'none' };
}

/** A sign-in response as a test user, with the auth header for later calls. */
export function asTestUser(
  login: { token: string; user: { id: string; name: string; role: Role; organisationId: string } },
  phone: string,
): TestUser {
  return {
    ...login.user,
    phone,
    token: login.token,
    actor: { kind: 'user', userId: login.user.id, role: login.user.role },
    auth: { Authorization: `Bearer ${login.token}` },
  };
}

/** A worker signs up on their own phone. */
export async function signUpWorker(
  h: Harness,
  phone = newPhone(),
  options: { pin?: string; name?: string } = {},
) {
  const { ticket } = await ticketFor(h, phone);
  const res = await h.http.post('/v1/auth/register').send({
    ticket,
    pin: options.pin ?? '9173',
    name: options.name ?? 'Kavita Joshi',
    language: 'hi',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return {
    worker: asTestUser(res.body, phone),
    workerId: res.body.workerId as string,
    claimed: res.body.claimed as boolean,
  };
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

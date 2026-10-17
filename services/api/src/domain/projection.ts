/**
 * Writes each synced event into its tables, in the push's transaction, and
 * raises the integrity flags the README asks for (FR-11).
 */
import { and, eq, ne } from 'drizzle-orm';
import type { MessageParams, SyncEvent, SyncEventOf } from '@hunarpramaan/contracts';
import type { Tx } from '../db/client';
import {
  calibrationScores,
  consentWithdrawals,
  consents,
  declarations,
  evidence,
  mappingResults,
  recommendations,
  routeDecisions,
  scores,
  sessions,
  workers,
} from '../db/schema';
import type { Deps } from './context';
import { raiseFlag } from './flags';
import { distanceM } from './geo';
import type { QualificationLoader } from './packs';
import { sampleForRescoring } from './rescoring';
import type { MismatchParams } from './messages';
import { recomputeResult, resultMismatch } from './results';

/** A projection that cannot apply: the event is kept in the chain and flagged. */
export class InvalidEvent extends Error {}

export interface ProjectionContext {
  tx: Tx;
  deps: Pick<Deps, 'config' | 'random' | 'newId'>;
  loadQualification: QualificationLoader;
  /** Uploads the phone should do once the push is acknowledged. */
  uploads: { evidenceId: string; sha256: string; mimeType: string }[];
}

const userId = (event: SyncEvent) => (event.actor.kind === 'user' ? event.actor.userId : null);

/** The person behind an event that only people may create (the authority table ensures it). */
function personOf(event: SyncEvent): string {
  const id = userId(event);
  if (!id) throw new InvalidEvent(`${event.type} must come from a person`);
  return id;
}
const at = (iso: string) => new Date(iso);

/** The session id an event belongs to, if any; stored on the audit entry for lookups. */
export function sessionIdOf(event: SyncEvent): string | null {
  switch (event.type) {
    case 'session.started':
    case 'evidence.captured':
    case 'score.recorded':
    case 'recommendation.signed':
      return event.payload.sessionId;
    default:
      return null;
  }
}

async function sessionFor(ctx: ProjectionContext, event: SyncEvent, sessionId: string) {
  const [session] = await ctx.tx.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) throw new InvalidEvent(`session ${sessionId} is unknown`);
  if (session.assessorId !== userId(event)) {
    throw new InvalidEvent(`session ${sessionId} belongs to another assessor`);
  }
  return session;
}

export async function project(ctx: ProjectionContext, event: SyncEvent): Promise<void> {
  const { tx } = ctx;
  switch (event.type) {
    case 'worker.registered': {
      const p = event.payload;
      const [existing] = await tx
        .select({ id: workers.id })
        .from(workers)
        .where(eq(workers.id, p.workerId));
      if (existing) throw new InvalidEvent(`worker ${p.workerId} is already registered`);
      await tx.insert(workers).values({
        id: p.workerId,
        name: p.name,
        phone: p.phone,
        language: p.language,
        ekycRef: p.ekycRef ?? null,
        registeredBy: personOf(event),
        createdAt: at(event.occurredAt),
      });
      return;
    }
    case 'consent.given': {
      const p = event.payload;
      await tx.insert(consents).values({
        id: p.consentId,
        workerId: p.workerId,
        noticeVersion: p.noticeVersion,
        language: p.language,
        readAloud: p.readAloud,
        givenAt: at(event.occurredAt),
      });
      return;
    }
    case 'consent.withdrawn':
      await tx.insert(consentWithdrawals).values({
        id: event.id,
        consentId: event.payload.consentId,
        withdrawnAt: at(event.occurredAt),
      });
      return;
    case 'declaration.recorded': {
      const p = event.payload;
      await tx.insert(declarations).values({
        id: p.declarationId,
        workerId: p.workerId,
        language: p.language,
        source: p.source,
        asrTranscript: p.asrTranscript,
        transcript: p.transcript,
        recordedAt: at(event.occurredAt),
      });
      return;
    }
    case 'mapping.suggested': {
      const p = event.payload;
      await tx.insert(mappingResults).values({
        id: event.id,
        declarationId: p.declarationId,
        engine: p.engine,
        packVersion: p.packVersion,
        results: p.results,
        suggestedNqrCode: p.suggestedNqrCode,
        suggestedRoute: p.suggestedRoute,
        needsReview: p.needsReview,
        createdAt: at(event.occurredAt),
      });
      return;
    }
    case 'route.decided': {
      const p = event.payload;
      await tx.insert(routeDecisions).values({
        id: event.id,
        declarationId: p.declarationId,
        nqrCode: p.nqrCode,
        route: p.route,
        suggested: p.suggested,
        reason: p.reason ?? null,
        decidedBy: personOf(event),
        decidedAt: at(event.occurredAt),
        origin: 'device',
      });
      return;
    }
    case 'session.started':
      return startSession(ctx, event);
    case 'calibration.scored': {
      const p = event.payload;
      await tx.insert(calibrationScores).values({
        id: event.id,
        calibrationRunId: p.calibrationRunId,
        clipId: p.clipId,
        criterionId: p.criterionId,
        value: p.value,
        assessorId: personOf(event),
        recordedAt: at(event.occurredAt),
      });
      return;
    }
    case 'evidence.captured':
      return captureEvidence(ctx, event);
    case 'score.recorded':
      return recordScore(ctx, event);
    case 'recommendation.signed':
      return signRecommendation(ctx, event, 'device');
  }
}

async function startSession(ctx: ProjectionContext, event: SyncEventOf<'session.started'>) {
  const p = event.payload;
  const qualification = await ctx.loadQualification(p.packVersion, p.nqrCode);
  if (!qualification) throw new InvalidEvent(`pack ${p.packVersion} has no ${p.nqrCode}`);
  await ctx.tx.insert(sessions).values({
    id: p.sessionId,
    workerId: p.workerId,
    assessorId: personOf(event),
    nqrCode: p.nqrCode,
    packVersion: p.packVersion,
    ekycRef: p.ekycRef,
    startPhotoSha256: p.startPhotoSha256,
    gps: p.gps,
    deviceId: event.deviceId,
    startedAt: at(event.occurredAt),
  });
  if (p.gps.mocked) {
    await raiseFlag(ctx.tx, {
      kind: 'mock_gps',
      sessionId: p.sessionId,
      deviceId: event.deviceId,
      params: {},
    });
  }
}

async function captureEvidence(ctx: ProjectionContext, event: SyncEventOf<'evidence.captured'>) {
  const p = event.payload;
  const session = await sessionFor(ctx, event, p.sessionId);
  const qualification = await ctx.loadQualification(session.packVersion, session.nqrCode);
  const known = qualification?.nos.some((n) => n.criteria.some((c) => c.id === p.criterionId));
  if (!known) throw new InvalidEvent(`${p.criterionId} is not in ${session.nqrCode}`);

  await ctx.tx.insert(evidence).values({
    id: p.evidenceId,
    sessionId: p.sessionId,
    criterionId: p.criterionId,
    sha256: p.sha256,
    bytes: p.bytes,
    mimeType: p.mimeType,
    durationSec: p.durationSec ?? null,
    capturedAt: at(p.capturedAt),
    gps: p.gps,
    deviceId: event.deviceId,
  });
  ctx.uploads.push({ evidenceId: p.evidenceId, sha256: p.sha256, mimeType: p.mimeType });

  const flagFor = (kind: 'mock_gps' | 'geofence' | 'reused_clip', params: MessageParams) =>
    raiseFlag(ctx.tx, {
      kind,
      params,
      sessionId: p.sessionId,
      evidenceId: p.evidenceId,
      deviceId: event.deviceId,
    });

  if (p.gps.mocked) await flagFor('mock_gps', { criterionId: p.criterionId });
  const away = distanceM(session.gps, p.gps);
  if (away > ctx.deps.config.GEOFENCE_RADIUS_M) {
    await flagFor('geofence', { criterionId: p.criterionId, metres: Math.round(away) });
  }
  // Exact-hash reuse: the same file submitted as evidence before.
  const [reused] = await ctx.tx
    .select({ criterionId: evidence.criterionId, capturedAt: evidence.capturedAt })
    .from(evidence)
    .where(and(eq(evidence.sha256, p.sha256), ne(evidence.id, p.evidenceId)))
    .limit(1);
  if (reused) {
    await flagFor('reused_clip', {
      criterionId: reused.criterionId,
      date: reused.capturedAt.toISOString().slice(0, 10),
    });
  }
}

async function recordScore(ctx: ProjectionContext, event: SyncEventOf<'score.recorded'>) {
  const p = event.payload;
  const session = await sessionFor(ctx, event, p.sessionId);
  const qualification = await ctx.loadQualification(session.packVersion, session.nqrCode);
  const known = qualification?.nos.some((n) => n.criteria.some((c) => c.id === p.criterionId));
  if (!known) throw new InvalidEvent(`${p.criterionId} is not in ${session.nqrCode}`);

  await ctx.tx.insert(scores).values({
    id: event.id,
    sessionId: p.sessionId,
    criterionId: p.criterionId,
    value: p.value,
    evidenceIds: p.evidenceIds,
    aiFlags: p.aiFlags,
    conflictReason: p.conflictReason ?? null,
    supersedes: p.supersedes ?? null,
    assessorId: personOf(event),
    recordedAt: at(event.occurredAt),
  });
}

export interface SignInput {
  id: string;
  sessionId: string;
  userId: string;
  signedAt: Date;
  payload: SyncEventOf<'recommendation.signed'>['payload'];
}

/**
 * Store a signed recommendation, recompute its result, and queue the re-score
 * sample. Returns the mismatch, if any; offline signatures are kept and flagged,
 * online ones are refused by the caller.
 */
export async function storeRecommendation(
  ctx: ProjectionContext,
  input: SignInput,
  origin: 'device' | 'web',
): Promise<MismatchParams | null> {
  const p = input.payload;
  const [session] = await ctx.tx.select().from(sessions).where(eq(sessions.id, input.sessionId));
  if (!session) throw new InvalidEvent(`session ${input.sessionId} is unknown`);
  if (session.assessorId !== input.userId) {
    throw new InvalidEvent(`only the session's assessor can sign it`);
  }
  if (p.nqrCode !== session.nqrCode || p.packVersion !== session.packVersion) {
    throw new InvalidEvent('the signed QP or pack version differs from the session');
  }
  const qualification = await ctx.loadQualification(session.packVersion, session.nqrCode);
  if (!qualification)
    throw new InvalidEvent(`pack ${session.packVersion} has no ${session.nqrCode}`);
  const mismatch = resultMismatch(
    await recomputeResult(ctx.tx, session.id, qualification, p.scoreEventIds),
    p,
  );
  if (mismatch && origin === 'web') return mismatch;

  await ctx.tx.insert(recommendations).values({
    id: p.recommendationId,
    sessionId: session.id,
    nqrCode: p.nqrCode,
    packVersion: p.packVersion,
    outcome: p.outcome,
    aggregate: p.aggregate,
    nosTotals: p.nosTotals,
    scoreEventIds: p.scoreEventIds,
    signedBy: input.userId,
    signedAt: input.signedAt,
    origin,
  });
  if (mismatch) {
    await raiseFlag(ctx.tx, {
      kind: 'result_mismatch',
      sessionId: session.id,
      deviceId: session.deviceId,
      params: mismatch,
    });
  }
  await sampleForRescoring(ctx.tx, ctx.deps, session.id);
  return mismatch;
}

async function signRecommendation(
  ctx: ProjectionContext,
  event: SyncEventOf<'recommendation.signed'>,
  origin: 'device',
) {
  await storeRecommendation(
    ctx,
    {
      id: event.id,
      sessionId: event.payload.sessionId,
      userId: personOf(event),
      signedAt: at(event.occurredAt),
      payload: event.payload,
    },
    origin,
  );
}

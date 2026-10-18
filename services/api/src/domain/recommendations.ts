import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { ApprovalDecision, Blocker } from '@hunarpramaan/contracts';
import type { Db, Tx } from '../db/client';
import {
  approvals,
  certificates,
  evidence,
  evidenceChecks,
  flags,
  recommendations,
  sessions,
  workers,
} from '../db/schema';
import { conflict, notFound } from '../http/errors';
import { sessionDevices, verifyDeviceChain, type DeviceChainResult } from './chain';
import type { Deps } from './context';
import { describeBlocker } from './messages';
import type { QualificationLoader } from './packs';
import { recomputeResult, resultMismatch } from './results';
import { sessionInScope, type Scope } from './scope';

type Recommendation = typeof recommendations.$inferSelect;

/** The newest check for each clip. */
async function latestChecks(tx: Db | Tx, evidenceIds: string[]) {
  if (evidenceIds.length === 0) return new Map<string, 'verified' | 'mismatch'>();
  const rows = await tx
    .select()
    .from(evidenceChecks)
    .where(inArray(evidenceChecks.evidenceId, evidenceIds))
    .orderBy(evidenceChecks.checkedAt, evidenceChecks.id);
  return new Map(rows.map((r) => [r.evidenceId, r.status]));
}

/**
 * Why a recommendation cannot be approved yet. README "Evidence integrity":
 * broken or missing evidence blocks the recommendation.
 */
export async function approvalBlockers(
  tx: Db | Tx,
  recommendation: Recommendation,
  loadQualification: QualificationLoader,
  /** Chain results already computed in this request, by device. */
  chains: Map<string, DeviceChainResult> = new Map(),
): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  const [session] = await tx
    .select()
    .from(sessions)
    .where(eq(sessions.id, recommendation.sessionId));
  if (!session) return [{ code: 'missing_data', params: {} }];
  const qualification = await loadQualification(session.packVersion, session.nqrCode);
  if (!qualification) return [{ code: 'missing_data', params: {} }];

  // Phones sync in any order, so the session can arrive before its worker.
  const [worker] = await tx
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.id, session.workerId));
  if (!worker) blockers.push({ code: 'worker_unknown', params: {} });

  const clips = await tx.select().from(evidence).where(eq(evidence.sessionId, session.id));
  const checks = await latestChecks(
    tx,
    clips.map((c) => c.id),
  );
  const criteriaWithClips = new Set(clips.map((c) => c.criterionId));
  for (const n of qualification.nos) {
    for (const c of n.criteria) {
      if (!criteriaWithClips.has(c.id))
        blockers.push({ code: 'no_evidence', params: { criterionId: c.id } });
    }
  }
  for (const clip of clips) {
    const check = checks.get(clip.id);
    if (check === 'mismatch')
      blockers.push({ code: 'clip_mismatch', params: { criterionId: clip.criterionId } });
    else if (!check)
      blockers.push({ code: 'clip_unchecked', params: { criterionId: clip.criterionId } });
  }

  // Clip hashes and the signed result are checked live, so only these flags add a blocker.
  const blocking = await tx
    .select({ kind: flags.kind, params: flags.params })
    .from(flags)
    .where(
      and(
        inArray(flags.kind, ['chain_broken', 'invalid_event']),
        // The session's own flags, plus device-wide ones such as a broken chain.
        or(
          eq(flags.sessionId, session.id),
          and(isNull(flags.sessionId), eq(flags.deviceId, session.deviceId)),
        ),
      ),
    );
  for (const flag of blocking) {
    blockers.push({
      code: flag.kind === 'chain_broken' ? 'chain_broken' : 'invalid_event',
      params: flag.params,
    });
  }

  // Nothing new may start once the account is deactivated or the phone retired (ADR 010 point 8).
  const drained = await tx
    .select({ params: flags.params })
    .from(flags)
    .where(and(eq(flags.kind, 'drained_work'), eq(flags.sessionId, session.id)));
  const startedLate = drained.find((f) => f.params.when === 'after');
  if (startedLate) {
    blockers.push({
      code: 'started_after_deactivation',
      params: { by: startedLate.params.by ?? 'account' },
    });
  }

  // The stored chains are re-verified, so an edit in the database blocks approval too.
  for (const deviceId of await sessionDevices(tx, session.id)) {
    const chain = chains.get(deviceId) ?? (await verifyDeviceChain(tx, deviceId));
    chains.set(deviceId, chain);
    if (!chain.ok) {
      blockers.push({
        code: 'stored_chain',
        params: { deviceId, seq: chain.failedAtSeq ?? 0, reason: chain.reason ?? '' },
      });
    }
  }

  // A mismatch is checked live against this recommendation, not from old flags.
  const recomputed = await recomputeResult(
    tx,
    session.id,
    qualification,
    recommendation.scoreEventIds,
  );
  const mismatch = resultMismatch(recomputed, recommendation);
  if (mismatch) blockers.push({ code: 'result_mismatch', params: mismatch });

  return blockers;
}

/** The recommendation that currently stands for a session: the newest one. */
export async function currentRecommendation(tx: Tx, sessionId: string) {
  const [row] = await tx
    .select()
    .from(recommendations)
    .where(eq(recommendations.sessionId, sessionId))
    .orderBy(desc(recommendations.signedAt), desc(recommendations.id))
    .limit(1);
  return row ?? null;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A short, unguessable code for the certificate's QR link, for example HP-7K3M9Q2XRT. */
export function newCertificateId(): string {
  const bytes = randomBytes(10);
  let code = '';
  for (const byte of bytes) code += CROCKFORD[byte % 32];
  return `HP-${code}`;
}

export interface Decision {
  approvalId: string;
  decision: ApprovalDecision;
  certificateId: string | null;
}

/** The awarding body approves or returns a signed recommendation (FR-17). */
export async function decideRecommendation(
  tx: Tx,
  deps: Pick<Deps, 'newId'>,
  loadQualification: QualificationLoader,
  input: {
    recommendationId: string;
    decision: ApprovalDecision;
    note?: string | undefined;
    userId: string;
    /** Only the awarding body that owns the QP decides (ADR 010 point 7). */
    scope: Scope;
  },
): Promise<Decision> {
  const [recommendation] = await tx
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, input.recommendationId));
  if (!recommendation) throw notFound('Recommendation');
  const [owning] = await tx
    .select()
    .from(sessions)
    .where(eq(sessions.id, recommendation.sessionId));
  if (!owning || !sessionInScope(input.scope, owning)) throw notFound('Recommendation');

  const current = await currentRecommendation(tx, recommendation.sessionId);
  if (current?.id !== recommendation.id) {
    throw conflict('A newer recommendation was signed for this session');
  }
  const [existing] = await tx
    .select()
    .from(approvals)
    .where(eq(approvals.recommendationId, recommendation.id));
  if (existing) throw conflict(`This recommendation was already ${existing.decision}`);

  if (input.decision === 'approved') {
    const blockers = await approvalBlockers(tx, recommendation, loadQualification);
    if (blockers.length > 0) {
      throw conflict('This recommendation cannot be approved yet', blockers.map(describeBlocker));
    }
  }

  const approvalId = deps.newId();
  await tx.insert(approvals).values({
    id: approvalId,
    recommendationId: recommendation.id,
    decision: input.decision,
    note: input.note ?? null,
    decidedBy: input.userId,
  });

  let certificateId: string | null = null;
  if (input.decision === 'approved' && recommendation.outcome === 'pass') {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, recommendation.sessionId));
    if (!session) throw notFound('Session');
    certificateId = newCertificateId();
    await tx.insert(certificates).values({
      id: certificateId,
      recommendationId: recommendation.id,
      workerId: session.workerId,
      nqrCode: recommendation.nqrCode,
    });
  }
  return { approvalId, decision: input.decision, certificateId };
}

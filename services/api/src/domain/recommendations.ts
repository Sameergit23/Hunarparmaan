import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { BLOCKING_FLAGS, type ApprovalDecision } from '@hunarpramaan/contracts';
import type { Tx } from '../db/client';
import {
  approvals,
  certificates,
  evidence,
  evidenceChecks,
  flags,
  recommendations,
  sessions,
} from '../db/schema';
import { conflict, notFound } from '../http/errors';
import { sessionDevices, verifyDeviceChain } from './chain';
import type { Deps } from './context';
import type { QualificationLoader } from './packs';
import { recomputeResult, resultMismatch } from './results';

type Recommendation = typeof recommendations.$inferSelect;

/** The newest check for each clip. */
async function latestChecks(tx: Tx, evidenceIds: string[]) {
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
  tx: Tx,
  recommendation: Recommendation,
  loadQualification: QualificationLoader,
): Promise<string[]> {
  const blockers: string[] = [];
  const [session] = await tx
    .select()
    .from(sessions)
    .where(eq(sessions.id, recommendation.sessionId));
  if (!session) return ['the session is missing'];
  const qualification = await loadQualification(session.packVersion, session.nqrCode);
  if (!qualification) return [`pack ${session.packVersion} has no ${session.nqrCode}`];

  const clips = await tx.select().from(evidence).where(eq(evidence.sessionId, session.id));
  const checks = await latestChecks(
    tx,
    clips.map((c) => c.id),
  );
  const criteriaWithClips = new Set(clips.map((c) => c.criterionId));
  for (const n of qualification.nos) {
    for (const c of n.criteria) {
      if (!criteriaWithClips.has(c.id)) blockers.push(`no evidence for ${c.id}`);
    }
  }
  for (const clip of clips) {
    const check = checks.get(clip.id);
    if (check === 'mismatch') blockers.push(`clip for ${clip.criterionId} does not match its hash`);
    else if (!check) blockers.push(`clip for ${clip.criterionId} is not uploaded and checked yet`);
  }

  const blocking = await tx
    .select({ kind: flags.kind, detail: flags.detail })
    .from(flags)
    .where(
      and(
        inArray(flags.kind, [...BLOCKING_FLAGS]),
        // The session's own flags, plus device-wide ones such as a broken chain.
        or(
          eq(flags.sessionId, session.id),
          and(isNull(flags.sessionId), eq(flags.deviceId, session.deviceId)),
        ),
      ),
    );
  for (const flag of blocking) {
    if (flag.kind !== 'result_mismatch')
      blockers.push(`${flag.kind.replace('_', ' ')}: ${flag.detail}`);
  }

  // The stored chains are re-verified, so an edit in the database blocks approval too.
  for (const deviceId of await sessionDevices(tx, session.id)) {
    const chain = await verifyDeviceChain(tx, deviceId);
    if (!chain.ok)
      blockers.push(
        `hash chain of ${deviceId} fails at seq ${chain.failedAtSeq} (${chain.reason})`,
      );
  }

  // A mismatch is checked live against this recommendation, not from old flags.
  const recomputed = await recomputeResult(
    tx,
    session.id,
    qualification,
    recommendation.scoreEventIds,
  );
  const mismatch = resultMismatch(recomputed, recommendation);
  if (mismatch) blockers.push(`result mismatch: ${mismatch}`);

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
  },
): Promise<Decision> {
  const [recommendation] = await tx
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, input.recommendationId));
  if (!recommendation) throw notFound('Recommendation');

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
    if (blockers.length > 0) throw conflict('This recommendation cannot be approved yet', blockers);
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

/**
 * Read models for the web dashboard. Data sets are small (one trade, a pilot),
 * so these favour plain queries assembled in code over clever SQL.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AgreementReport,
  AssessorRow,
  CertificateVerification,
  ChainVerification,
  CriterionResult,
  DashboardSummary,
  EvidenceView,
  FlagKind,
  FlagView,
  PendingRecommendation,
  RescoreTask,
  ScoreValue,
  SessionDetail,
  SessionListItem,
  SessionStatus,
  SidhExport,
  StudyRound,
} from '@hunarpramaan/contracts';
import type { Db } from '../db/client';
import {
  approvals,
  certificates,
  criteria,
  evidence,
  evidenceChecks,
  flagReviews,
  flags,
  qualifications,
  recommendations,
  rescoreTasks,
  rescores,
  scores,
  sessions,
  studyRounds,
  users,
  workers,
} from '../db/schema';
import { notFound } from '../http/errors';
import { sessionDevices, verifyDeviceChain, type DeviceChainResult } from './chain';
import { qualificationLoader } from './packs';
import { approvalBlockers } from './recommendations';
import { recomputeResult, standingScores } from './results';

/** An assessor is an outlier below this agreement with blind re-scores… */
export const OUTLIER_AGREEMENT = 0.7;
/** …once at least this many of their clips were re-scored. */
export const OUTLIER_MIN_RESCORED = 3;

const iso = (d: Date) => d.toISOString();

/** First name and last initial: "Ramesh Kumar" → "Ramesh K." */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  return last ? `${first} ${[...last][0]}.` : first;
}

async function namesById(db: Db, table: typeof users | typeof workers, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(inArray(table.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** The newest recommendation per session, with its approval and certificate. */
async function recommendationsBySession(db: Db, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ rec: recommendations, approval: approvals, certificateId: certificates.id })
    .from(recommendations)
    .leftJoin(approvals, eq(approvals.recommendationId, recommendations.id))
    .leftJoin(certificates, eq(certificates.recommendationId, recommendations.id))
    .where(inArray(recommendations.sessionId, sessionIds))
    .orderBy(asc(recommendations.signedAt), asc(recommendations.id));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) latest.set(row.rec.sessionId, row);
  return latest;
}

function statusOf(row: { approval: { decision: string } | null } | undefined): SessionStatus {
  if (!row) return 'in_progress';
  if (row.approval?.decision === 'approved') return 'approved';
  if (row.approval?.decision === 'returned') return 'returned';
  return 'signed';
}

async function openFlagCounts(db: Db, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ sessionId: flags.sessionId, n: count() })
    .from(flags)
    .leftJoin(flagReviews, eq(flagReviews.flagId, flags.id))
    .where(and(inArray(flags.sessionId, sessionIds), isNull(flagReviews.id)))
    .groupBy(flags.sessionId);
  return new Map(rows.flatMap((r) => (r.sessionId ? [[r.sessionId, Number(r.n)] as const] : [])));
}

async function checksByEvidence(db: Db, evidenceIds: string[]) {
  if (evidenceIds.length === 0) return new Map<string, 'verified' | 'mismatch'>();
  const rows = await db
    .select()
    .from(evidenceChecks)
    .where(inArray(evidenceChecks.evidenceId, evidenceIds))
    .orderBy(asc(evidenceChecks.checkedAt), asc(evidenceChecks.id));
  return new Map(rows.map((r) => [r.evidenceId, r.status]));
}

export async function listSessions(db: Db): Promise<SessionListItem[]> {
  const rows = await db
    .select({ session: sessions, qualification: qualifications })
    .from(sessions)
    .innerJoin(qualifications, eq(qualifications.nqrCode, sessions.nqrCode))
    .orderBy(desc(sessions.startedAt));
  const ids = rows.map((r) => r.session.id);
  const [workerNames, assessorNames, recs, flagCounts] = await Promise.all([
    namesById(
      db,
      workers,
      rows.map((r) => r.session.workerId),
    ),
    namesById(
      db,
      users,
      rows.map((r) => r.session.assessorId),
    ),
    recommendationsBySession(db, ids),
    openFlagCounts(db, ids),
  ]);
  const clips = ids.length
    ? await db
        .select({ id: evidence.id, sessionId: evidence.sessionId })
        .from(evidence)
        .where(inArray(evidence.sessionId, ids))
    : [];
  const checks = await checksByEvidence(
    db,
    clips.map((c) => c.id),
  );

  return rows.map(({ session, qualification }) => {
    const own = clips.filter((c) => c.sessionId === session.id);
    const rec = recs.get(session.id);
    return {
      id: session.id,
      workerName: workerNames.get(session.workerId) ?? '',
      assessorName: assessorNames.get(session.assessorId) ?? '',
      nqrCode: session.nqrCode,
      qualificationTitle: qualification.title,
      nsqfLevel: qualification.nsqfLevel,
      startedAt: iso(session.startedAt),
      evidenceCount: own.length,
      verifiedEvidenceCount: own.filter((c) => checks.get(c.id) === 'verified').length,
      openFlags: flagCounts.get(session.id) ?? 0,
      status: statusOf(rec),
      outcome: rec?.rec.outcome ?? null,
    };
  });
}

async function flagViews(db: Db, where?: ReturnType<typeof eq>): Promise<FlagView[]> {
  const rows = await db
    .select({ flag: flags, review: flagReviews, reviewer: users.name, session: sessions })
    .from(flags)
    .leftJoin(flagReviews, eq(flagReviews.flagId, flags.id))
    .leftJoin(users, eq(users.id, flagReviews.reviewedBy))
    .leftJoin(sessions, eq(sessions.id, flags.sessionId))
    .where(where)
    .orderBy(desc(flags.createdAt));
  const [workerNames, assessorNames] = await Promise.all([
    namesById(
      db,
      workers,
      rows.flatMap((r) => (r.session ? [r.session.workerId] : [])),
    ),
    namesById(
      db,
      users,
      rows.flatMap((r) => (r.session ? [r.session.assessorId] : [])),
    ),
  ]);
  return rows.map(({ flag, review, reviewer, session }) => ({
    id: flag.id,
    kind: flag.kind as FlagKind,
    sessionId: flag.sessionId,
    evidenceId: flag.evidenceId,
    deviceId: flag.deviceId,
    params: flag.params,
    detail: flag.detail,
    createdAt: iso(flag.createdAt),
    workerName: session ? (workerNames.get(session.workerId) ?? null) : null,
    assessorName: session ? (assessorNames.get(session.assessorId) ?? null) : null,
    review: review ? { note: review.note, by: reviewer ?? '', at: iso(review.reviewedAt) } : null,
  }));
}

export const listFlags = (db: Db) => flagViews(db);

export async function sessionDetail(db: Db, sessionId: string): Promise<SessionDetail> {
  const [item] = (await listSessions(db)).filter((s) => s.id === sessionId);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!item || !session) throw notFound('Session');

  const load = qualificationLoader(db);
  const qualification = await load(session.packVersion, session.nqrCode);
  if (!qualification) throw notFound('Qualification');

  const clips = await db
    .select()
    .from(evidence)
    .where(eq(evidence.sessionId, sessionId))
    .orderBy(asc(evidence.capturedAt));
  const checks = await checksByEvidence(
    db,
    clips.map((c) => c.id),
  );
  const evidenceViews: EvidenceView[] = clips.map((c) => ({
    id: c.id,
    criterionId: c.criterionId,
    sha256: c.sha256,
    mimeType: c.mimeType,
    durationSec: c.durationSec,
    capturedAt: iso(c.capturedAt),
    check: checks.get(c.id) ?? 'waiting_upload',
    // AI checks on clips (ADR 012) are stored once the vision job lands.
    vision: null,
  }));

  const standing = standingScores(
    await db.select().from(scores).where(eq(scores.sessionId, sessionId)),
  );
  const rescoreRows = await db
    .select({ criterionId: rescoreTasks.criterionId, value: rescores.value })
    .from(rescoreTasks)
    .innerJoin(rescores, eq(rescores.taskId, rescoreTasks.id))
    .where(eq(rescoreTasks.sessionId, sessionId));
  const rescoreBy = new Map(rescoreRows.map((r) => [r.criterionId, r.value as ScoreValue]));

  const criteriaResults: CriterionResult[] = qualification.nos.flatMap((n) =>
    n.criteria.map((c) => {
      const score = standing.get(c.id);
      return {
        criterionId: c.id,
        nosCode: n.code,
        text: c.text,
        marks: c.marks,
        score: (score?.value as ScoreValue | undefined) ?? null,
        aiFlags: score?.aiFlags ?? [],
        conflictReason: score?.conflictReason ?? null,
        rescore: rescoreBy.get(c.id) ?? null,
      };
    }),
  );

  const recRow = (await recommendationsBySession(db, [sessionId])).get(sessionId);
  // Reads only: no transaction, so nothing waits on a lock this request holds.
  const result = {
    computed: await recomputeResult(db, sessionId, qualification),
    blockers: recRow ? await approvalBlockers(db, recRow.rec, load) : [],
  };
  const signerName = recRow
    ? (await namesById(db, users, [recRow.rec.signedBy])).get(recRow.rec.signedBy)
    : undefined;
  const approverName = recRow?.approval
    ? (await namesById(db, users, [recRow.approval.decidedBy])).get(recRow.approval.decidedBy)
    : undefined;

  return {
    ...item,
    packVersion: session.packVersion,
    passPercent: qualification.passRule.aggregatePercent,
    deviceIds: await sessionDevices(db, sessionId),
    evidence: evidenceViews,
    criteria: criteriaResults,
    nos: qualification.nos.map((n, i) => ({
      code: n.code,
      title: n.title,
      weight: n.weight,
      fraction: result.computed.result.nos[i]?.fraction ?? 0,
    })),
    recommendation: recRow
      ? {
          id: recRow.rec.id,
          outcome: recRow.rec.outcome,
          aggregate: recRow.rec.aggregate,
          signedBy: signerName ?? '',
          signedAt: iso(recRow.rec.signedAt),
          approval: recRow.approval
            ? {
                decision: recRow.approval.decision,
                note: recRow.approval.note,
                by: approverName ?? '',
                at: iso(recRow.approval.decidedAt),
              }
            : null,
          certificateId: recRow.certificateId ?? null,
          blockers: result.blockers,
        }
      : null,
    flags: await flagViews(db, eq(flags.sessionId, sessionId)),
  };
}

export async function pendingRecommendations(db: Db): Promise<PendingRecommendation[]> {
  const items = (await listSessions(db)).filter((s) => s.status === 'signed');
  const recs = await recommendationsBySession(
    db,
    items.map((s) => s.id),
  );
  const load = qualificationLoader(db);
  // Recommendations from one phone share its chain: verify each chain once.
  const chains = new Map<string, DeviceChainResult>();
  const out: PendingRecommendation[] = [];
  for (const item of items) {
    const row = recs.get(item.id);
    if (!row) continue;
    out.push({
      id: row.rec.id,
      sessionId: item.id,
      workerName: item.workerName,
      assessorName: item.assessorName,
      qualificationTitle: item.qualificationTitle,
      nsqfLevel: item.nsqfLevel,
      outcome: row.rec.outcome,
      aggregate: row.rec.aggregate,
      signedAt: iso(row.rec.signedAt),
      blockers: await approvalBlockers(db, row.rec, load, chains),
    });
  }
  return out;
}

export async function dashboardSummary(db: Db): Promise<DashboardSummary> {
  const one = async (query: Promise<{ n: number }[]>) => Number((await query)[0]?.n ?? 0);
  const sessionsList = await listSessions(db);
  const clipIds = (await db.select({ id: evidence.id }).from(evidence)).map((c) => c.id);
  const checks = await checksByEvidence(db, clipIds);
  return {
    workers: await one(db.select({ n: count() }).from(workers)),
    sessions: sessionsList.length,
    sessionsSigned: sessionsList.filter((s) => s.status !== 'in_progress').length,
    certificates: await one(db.select({ n: count() }).from(certificates)),
    pendingApprovals: sessionsList.filter((s) => s.status === 'signed').length,
    openFlags: await one(
      db
        .select({ n: count() })
        .from(flags)
        .leftJoin(flagReviews, eq(flagReviews.flagId, flags.id))
        .where(isNull(flagReviews.id)),
    ),
    evidenceVerified: [...checks.values()].filter((s) => s === 'verified').length,
    evidenceTotal: clipIds.length,
    // Filled in from stored vision results once the vision job lands (ADR 012).
    vision: { clipsAnalysed: 0, clipsWithHints: 0, conflicts: 0, byCheck: [] },
  };
}

export async function agreementReport(db: Db): Promise<AgreementReport> {
  const study: StudyRound[] = (
    await db.select().from(studyRounds).orderBy(asc(studyRounds.round))
  ).map((r) => ({
    round: r.round,
    label: r.label,
    fleissKappa: r.fleissKappa,
    kappaCiLow: r.kappaCiLow,
    kappaCiHigh: r.kappaCiHigh,
    krippendorffAlpha: r.krippendorffAlpha,
    exactAgreement: r.exactAgreement,
    raters: r.raters,
    clips: r.clips,
    demo: r.demo,
  }));

  // Each re-score against the assessor's standing score for the same criterion.
  const tasks = await db
    .select({ task: rescoreTasks, rescore: rescores, assessorId: sessions.assessorId })
    .from(rescoreTasks)
    .innerJoin(sessions, eq(sessions.id, rescoreTasks.sessionId))
    .leftJoin(rescores, eq(rescores.taskId, rescoreTasks.id));
  const sessionIds = [...new Set(tasks.map((t) => t.task.sessionId))];
  const scoreRows = sessionIds.length
    ? await db.select().from(scores).where(inArray(scores.sessionId, sessionIds))
    : [];
  const standingBySession = new Map<string, Map<string, { value: number }>>();
  for (const id of sessionIds)
    standingBySession.set(id, standingScores(scoreRows.filter((s) => s.sessionId === id)));

  const perAssessor = new Map<string, { rescored: number; matches: number }>();
  let done = 0;
  let matches = 0;
  for (const { task, rescore, assessorId } of tasks) {
    if (!rescore) continue;
    const original = standingBySession.get(task.sessionId)?.get(task.criterionId);
    if (!original) continue;
    done += 1;
    const match = original.value === rescore.value;
    if (match) matches += 1;
    const row = perAssessor.get(assessorId) ?? { rescored: 0, matches: 0 };
    row.rescored += 1;
    if (match) row.matches += 1;
    perAssessor.set(assessorId, row);
  }

  const assessorUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.role, ['assessor', 'master_assessor']));
  const sessionCounts = new Map(
    (
      await db
        .select({ assessorId: sessions.assessorId, n: count() })
        .from(sessions)
        .groupBy(sessions.assessorId)
    ).map((r) => [r.assessorId, Number(r.n)]),
  );
  const assessors: AssessorRow[] = assessorUsers
    .filter((u) => sessionCounts.has(u.id))
    .map((u) => {
      const rescored = perAssessor.get(u.id)?.rescored ?? 0;
      const matched = perAssessor.get(u.id)?.matches ?? 0;
      const agreement = rescored > 0 ? matched / rescored : null;
      return {
        assessorId: u.id,
        name: u.name,
        sessions: sessionCounts.get(u.id) ?? 0,
        rescored,
        agreement,
        outlier:
          agreement !== null && rescored >= OUTLIER_MIN_RESCORED && agreement < OUTLIER_AGREEMENT,
      };
    })
    .sort((a, b) => Number(b.outlier) - Number(a.outlier) || a.name.localeCompare(b.name));

  return { study, rescore: { tasks: tasks.length, done, matches }, assessors };
}

/** Blind tasks for a master assessor: never their own sessions, never the original score. */
export async function rescoreQueue(db: Db, masterId: string): Promise<RescoreTask[]> {
  const rows = await db
    .select({ task: rescoreTasks, criterion: criteria })
    .from(rescoreTasks)
    .innerJoin(sessions, eq(sessions.id, rescoreTasks.sessionId))
    .innerJoin(
      criteria,
      and(eq(criteria.nqrCode, sessions.nqrCode), eq(criteria.id, rescoreTasks.criterionId)),
    )
    .leftJoin(rescores, eq(rescores.taskId, rescoreTasks.id))
    .where(and(isNull(rescores.id), sql`${sessions.assessorId} <> ${masterId}`))
    .orderBy(asc(rescoreTasks.createdAt));
  return rows.map(({ task, criterion }) => ({
    taskId: task.id,
    evidenceId: task.evidenceId,
    criterionId: task.criterionId,
    criterionText: criterion.text,
    rubric: criterion.rubric,
    reason: task.reason,
    createdAt: iso(task.createdAt),
  }));
}

export async function verifyCertificate(
  db: Db,
  certificateId: string,
): Promise<CertificateVerification> {
  const [row] = await db
    .select({ cert: certificates, worker: workers, qualification: qualifications })
    .from(certificates)
    .innerJoin(workers, eq(workers.id, certificates.workerId))
    .innerJoin(qualifications, eq(qualifications.nqrCode, certificates.nqrCode))
    .where(eq(certificates.id, certificateId.toUpperCase()));
  if (!row) return { valid: false, certificateId };
  return {
    valid: true,
    certificateId: row.cert.id,
    holder: maskName(row.worker.name),
    nqrCode: row.cert.nqrCode,
    qualificationTitle: row.qualification.title,
    nsqfLevel: row.qualification.nsqfLevel,
    awardingBody: row.qualification.awardingBody,
    issuedAt: iso(row.cert.issuedAt),
  };
}

/** Re-verify the stored hash chain of every device that wrote to this session. */
export async function verifySessionChains(
  db: Db,
  sessionId: string,
  now: Date,
): Promise<ChainVerification> {
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session) throw notFound('Session');
  const results = [];
  for (const deviceId of await sessionDevices(db, sessionId))
    results.push(await verifyDeviceChain(db, deviceId));
  return { sessionId, ok: results.every((r) => r.ok), checkedAt: iso(now), devices: results };
}

export async function sidhExport(db: Db, now: Date): Promise<SidhExport> {
  const rows = await db
    .select({
      cert: certificates,
      rec: recommendations,
      session: sessions,
      qualification: qualifications,
    })
    .from(certificates)
    .innerJoin(recommendations, eq(recommendations.id, certificates.recommendationId))
    .innerJoin(sessions, eq(sessions.id, recommendations.sessionId))
    .innerJoin(qualifications, eq(qualifications.nqrCode, certificates.nqrCode))
    .orderBy(asc(certificates.issuedAt));
  return {
    exportedAt: iso(now),
    mock: true,
    records: rows.map(({ cert, rec, session, qualification }) => ({
      certificateId: cert.id,
      nqrCode: cert.nqrCode,
      nsqfLevel: qualification.nsqfLevel,
      result: 'pass' as const,
      aggregatePercent: Math.round(rec.aggregate * 1000) / 10,
      ekycRef: session.ekycRef,
      issuedAt: iso(cert.issuedAt),
    })),
  };
}

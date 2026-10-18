/** Routes the web dashboard calls: review, sign-off, approval, monitoring. */
import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import {
  ApproveRequest,
  FlagReviewRequest,
  RescoreRequest,
  RouteOverrideRequest,
  SignRequest,
  canRead,
  type ApproveResponse,
} from '@hunarpramaan/contracts';
import { declarations, flagReviews, flags, mappingResults, routeDecisions } from '../db/schema';
import { isUniqueViolation } from '../db/errors';
import type { Deps } from '../domain/context';
import { qualificationLoader } from '../domain/packs';
import { InvalidEvent, storeRecommendation, type ProjectionContext } from '../domain/projection';
import { describeMismatch } from '../domain/messages';
import { decideRecommendation } from '../domain/recommendations';
import { recordRescore } from '../domain/rescores';
import {
  agreementReport,
  dashboardSummary,
  listFlags,
  listSessions,
  pendingRecommendations,
  rescoreQueue,
  sessionDetail,
  sidhExport,
  verifyCertificate,
  verifySessionChains,
} from '../domain/views';
import { currentUser, requireAction, requireRead } from '../http/auth';
import { conflict, notFound } from '../http/errors';
import { codeParam, idParam } from '../http/params';
import { parse } from '../http/validate';

export function officeRoutes(deps: Deps) {
  const router = Router();
  const { db } = deps;

  // --- Mobiliser: change the route or QP online, with a reason (FR-04) -------
  router.post('/v1/declarations/:id/override', requireAction('route.decided'), async (req, res) => {
    const user = currentUser(res);
    const declarationId = idParam(req);
    const input = parse(RouteOverrideRequest, req.body);
    const [declaration] = await db
      .select()
      .from(declarations)
      .where(eq(declarations.id, declarationId));
    if (!declaration) throw notFound('Declaration');
    const [suggestion] = await db
      .select()
      .from(mappingResults)
      .where(eq(mappingResults.declarationId, declarationId))
      .orderBy(desc(mappingResults.createdAt))
      .limit(1);
    const id = deps.newId();
    await db.insert(routeDecisions).values({
      id,
      declarationId,
      nqrCode: input.nqrCode,
      route: input.route,
      suggested: suggestion
        ? { nqrCode: suggestion.suggestedNqrCode, route: suggestion.suggestedRoute }
        : null,
      reason: input.reason,
      decidedBy: user.id,
      decidedAt: deps.now(),
      origin: 'web',
    });
    res.status(201).json({ id });
  });

  // --- Sessions --------------------------------------------------------------
  router.get('/v1/sessions', requireRead('sessions.read'), async (_req, res) => {
    res.json(await listSessions(db));
  });

  router.get('/v1/sessions/:id', requireRead('sessions.read'), async (req, res) => {
    res.json(await sessionDetail(db, idParam(req)));
  });

  /** Online signing. The result must match the scores, or it is refused. */
  router.post('/v1/sessions/:id/sign', requireAction('recommendation.signed'), async (req, res) => {
    const user = currentUser(res);
    const sessionId = idParam(req);
    const payload = { ...parse(SignRequest, req.body), sessionId };
    const mismatch = await db.transaction(async (tx) => {
      const ctx: ProjectionContext = {
        tx,
        deps,
        loadQualification: qualificationLoader(tx),
        uploads: [],
      };
      try {
        return await storeRecommendation(
          ctx,
          {
            id: payload.recommendationId,
            sessionId,
            userId: user.id,
            signedAt: deps.now(),
            payload,
          },
          'web',
        );
      } catch (error) {
        if (error instanceof InvalidEvent) throw conflict(error.message);
        if (isUniqueViolation(error)) throw conflict('This recommendation id is already used');
        throw error;
      }
    });
    if (mismatch) {
      throw conflict('The signed result does not match the scores', [describeMismatch(mismatch)]);
    }
    res.status(201).json({ recommendationId: payload.recommendationId });
  });

  // --- Awarding body ---------------------------------------------------------
  router.get('/v1/recommendations', requireRead('recommendations.read'), async (_req, res) => {
    res.json(await pendingRecommendations(db));
  });

  router.post(
    '/v1/recommendations/:id/approve',
    requireAction('recommendation.approved'),
    async (req, res) => {
      const user = currentUser(res);
      const input = parse(ApproveRequest, req.body);
      const decision = await db.transaction((tx) =>
        decideRecommendation(tx, deps, qualificationLoader(tx), {
          recommendationId: idParam(req),
          decision: input.decision,
          note: input.note,
          userId: user.id,
        }),
      );
      const body: ApproveResponse = decision;
      res.status(201).json(body);
    },
  );

  router.post('/v1/exports/sidh', requireAction('sidh.exported'), async (_req, res) => {
    res.json(await sidhExport(db, deps.now()));
  });

  // --- Agency: integrity and monitoring --------------------------------------
  router.get('/v1/audit/sessions/:id/verify', requireRead('audit.verify'), async (req, res) => {
    res.json(await verifySessionChains(db, idParam(req), deps.now()));
  });

  router.get('/v1/flags', requireRead('flags.read'), async (_req, res) => {
    res.json(await listFlags(db));
  });

  router.post('/v1/flags/:id/review', requireAction('flag.reviewed'), async (req, res) => {
    const user = currentUser(res);
    const flagId = idParam(req);
    const { note } = parse(FlagReviewRequest, req.body);
    const [flag] = await db.select().from(flags).where(eq(flags.id, flagId));
    if (!flag) throw notFound('Flag');
    try {
      await db.insert(flagReviews).values({ id: deps.newId(), flagId, note, reviewedBy: user.id });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('This flag was already reviewed');
      throw error;
    }
    res.status(201).json({ flagId });
  });

  router.get('/v1/dashboard/summary', requireRead('dashboard.read'), async (_req, res) => {
    res.json(await dashboardSummary(db));
  });

  router.get('/v1/dashboard/agreement', requireRead('dashboard.read'), async (_req, res) => {
    const report = await agreementReport(db);
    // NCVET sees aggregates only: no per-assessor rows.
    const perPerson = canRead(currentUser(res).role, 'sessions.read');
    res.json(perPerson ? report : { ...report, assessors: [] });
  });

  // --- Master assessor: blind re-scoring (FR-13) ------------------------------
  router.get('/v1/rescoring', requireRead('rescoring.read'), async (_req, res) => {
    res.json(await rescoreQueue(db, currentUser(res).id));
  });

  router.post('/v1/rescoring', requireAction('rescore.recorded'), async (req, res) => {
    const input = parse(RescoreRequest, req.body);
    await recordRescore(deps, currentUser(res), input);
    res.status(201).json({ taskId: input.taskId });
  });

  return router;
}

/** Routes anyone can call: the certificate QR page and the public study results. */
export function publicRoutes(deps: Deps) {
  const router = Router();
  router.get('/v1/certificates/:id/verify', async (req, res) => {
    res.json(await verifyCertificate(deps.db, codeParam(req)));
  });
  router.get('/v1/public/study', async (_req, res) => {
    res.json((await agreementReport(deps.db)).study);
  });
  return router;
}

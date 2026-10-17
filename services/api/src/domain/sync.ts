/**
 * POST /v1/sync/push and GET /v1/sync/pull (README "Sync, step by step").
 *
 * A push is one transaction per device: the device row is locked, so two pushes
 * from one phone cannot interleave. Each event is acknowledged as stored,
 * duplicate (IT-01: idempotent by id) or rejected. Events must continue the
 * device's stored hash chain; everything from the first bad entry is rejected.
 */
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { verifyChain } from '@hunarpramaan/audit';
import {
  SyncPushRequest,
  type PullItem,
  type SessionUser,
  type SyncAck,
  type SyncEvent,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@hunarpramaan/contracts';
import {
  auditEntries,
  devices,
  evidence,
  evidenceChecks,
  rescoreTasks,
  rescores,
  sessions,
  tradePacks,
} from '../db/schema';
import { forbidden } from '../http/errors';
import { parse } from '../http/validate';
import type { Deps } from './context';
import { raiseFlag } from './flags';
import { qualificationLoader } from './packs';
import { InvalidEvent, project, sessionIdOf, type ProjectionContext } from './projection';

/** Events from the logged-in user, or from the phone's own keyword mapper. */
function actorMatches(event: SyncEvent, user: SessionUser): boolean {
  if (event.actor.kind === 'system') return event.actor.service === 'device-mapper';
  return event.actor.userId === user.id && event.actor.role === user.role;
}

export async function pushEvents(
  deps: Deps,
  user: SessionUser,
  body: unknown,
): Promise<SyncPushResponse> {
  const request = parse(SyncPushRequest, body);
  const events = request.events as SyncEvent[];
  const serverTime = deps.now();

  const response = await deps.db.transaction(async (tx) => {
    const [device] = await tx
      .select()
      .from(devices)
      .where(and(eq(devices.id, request.deviceId), isNull(devices.revokedAt)))
      .for('update');
    if (!device || device.userId !== user.id) {
      throw forbidden(`device ${request.deviceId} is not registered to you`);
    }

    const [head] = await tx
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.deviceId, device.id))
      .orderBy(desc(auditEntries.seq))
      .limit(1);
    const stored = new Map(
      (
        await tx
          .select({ id: auditEntries.id, hash: auditEntries.hash })
          .from(auditEntries)
          .where(
            inArray(
              auditEntries.id,
              events.map((e) => e.id),
            ),
          )
      ).map((r) => [r.id, r.hash]),
    );

    const acks = new Map<string, SyncAck>();
    const fresh: SyncEvent[] = [];
    for (const event of events) {
      const storedHash = stored.get(event.id);
      if (storedHash !== undefined) {
        acks.set(
          event.id,
          storedHash === event.hash
            ? { id: event.id, status: 'duplicate' }
            : {
                id: event.id,
                status: 'rejected',
                reason: 'an event with this id but different content is stored',
              },
        );
      } else if (head && event.seq <= head.seq) {
        acks.set(event.id, {
          id: event.id,
          status: 'rejected',
          reason: `seq ${event.seq} is already taken on this device`,
        });
      } else {
        fresh.push(event);
      }
    }

    // Chain check and actor check, in order: stop at the first bad event.
    const chain = verifyChain(fresh, { after: head ?? null });
    let accepted = chain.ok ? fresh.length : chain.index;
    let stopReason = chain.ok ? null : `hash chain broken at seq ${chain.seq} (${chain.reason})`;
    const wrongActor = fresh.slice(0, accepted).findIndex((e) => !actorMatches(e, user));
    if (wrongActor !== -1) {
      accepted = wrongActor;
      stopReason = `event at seq ${fresh[wrongActor]?.seq} was not created by you on this device`;
    }

    const ctx: ProjectionContext = {
      tx,
      deps,
      loadQualification: qualificationLoader(tx),
      uploads: [],
    };
    for (const event of fresh.slice(0, accepted)) {
      await tx.insert(auditEntries).values({
        deviceId: event.deviceId,
        seq: event.seq,
        id: event.id,
        type: event.type,
        actor: event.actor,
        occurredAt: event.occurredAt,
        receivedAt: serverTime,
        sessionId: sessionIdOf(event),
        payload: event.payload as Record<string, unknown>,
        prevHash: event.prevHash,
        hash: event.hash,
      });
      try {
        // A savepoint, so a projection that fails leaves the stored chain intact.
        await tx.transaction(async (savepoint) => project({ ...ctx, tx: savepoint }, event));
      } catch (error) {
        if (!(error instanceof InvalidEvent)) throw error;
        await raiseFlag(tx, {
          kind: 'invalid_event',
          sessionId: sessionIdOf(event),
          deviceId: event.deviceId,
          detail: `${event.type} at seq ${event.seq}: ${error.message}`,
        });
      }
      acks.set(event.id, { id: event.id, status: 'stored' });
    }
    for (const event of fresh.slice(accepted)) {
      acks.set(event.id, { id: event.id, status: 'rejected', reason: stopReason ?? 'rejected' });
    }
    if (stopReason && !chain.ok) {
      await raiseFlag(tx, { kind: 'chain_broken', deviceId: device.id, detail: stopReason });
    }

    const driftS = Math.abs(new Date(request.sentAt).getTime() - serverTime.getTime()) / 1000;
    if (driftS > deps.config.CLOCK_DRIFT_LIMIT_S) {
      await raiseFlag(tx, {
        kind: 'clock_drift',
        deviceId: device.id,
        detail: `device clock is ${Math.round(driftS / 60)} min away from server time`,
      });
    }

    const uploads = [];
    for (const upload of ctx.uploads) {
      const { url, expiresAt } = await deps.store.uploadUrl(
        upload.evidenceId,
        upload.sha256,
        upload.mimeType,
      );
      uploads.push({ evidenceId: upload.evidenceId, url, expiresAt: expiresAt.toISOString() });
    }

    return {
      serverTime: serverTime.toISOString(),
      acks: events.map(
        (e) => acks.get(e.id) ?? { id: e.id, status: 'rejected' as const, reason: 'not processed' },
      ),
      uploads,
    };
  });
  return response;
}

/** Cursor: the server time of the previous pull, base64url-encoded. */
const encodeCursor = (date: Date) => Buffer.from(date.toISOString()).toString('base64url');
function decodeCursor(cursor: string | undefined): Date {
  if (!cursor) return new Date(0);
  const date = new Date(Buffer.from(cursor, 'base64url').toString());
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export async function pullUpdates(
  deps: Deps,
  user: SessionUser,
  cursor?: string,
): Promise<SyncPullResponse> {
  const since = decodeCursor(cursor);
  const serverTime = deps.now();
  const items: PullItem[] = [];

  const packs = await deps.db.select().from(tradePacks).where(gt(tradePacks.createdAt, since));
  for (const pack of packs) {
    items.push({ type: 'trade_pack', packId: pack.id, version: pack.version, sha256: pack.sha256 });
  }

  // Server checks of this assessor's clips.
  const checks = await deps.db
    .select({ evidenceId: evidenceChecks.evidenceId, status: evidenceChecks.status })
    .from(evidenceChecks)
    .innerJoin(evidence, eq(evidence.id, evidenceChecks.evidenceId))
    .innerJoin(sessions, eq(sessions.id, evidence.sessionId))
    .where(and(eq(sessions.assessorId, user.id), gt(evidenceChecks.checkedAt, since)));
  for (const check of checks) items.push({ type: 'evidence_check', ...check });

  if (user.role === 'master_assessor') {
    const open = await deps.db
      .select({
        taskId: rescoreTasks.id,
        evidenceId: rescoreTasks.evidenceId,
        criterionId: rescoreTasks.criterionId,
        nqrCode: sessions.nqrCode,
      })
      .from(rescoreTasks)
      .innerJoin(sessions, eq(sessions.id, rescoreTasks.sessionId))
      .leftJoin(rescores, eq(rescores.taskId, rescoreTasks.id))
      .where(
        and(
          isNull(rescores.id),
          gt(rescoreTasks.createdAt, since),
          sql`${sessions.assessorId} <> ${user.id}`,
        ),
      );
    for (const task of open) items.push({ type: 'rescore_task', ...task });
  }

  return { cursor: encodeCursor(serverTime), serverTime: serverTime.toISOString(), items };
}

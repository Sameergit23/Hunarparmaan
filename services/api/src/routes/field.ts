/** Routes the phones call: device binding, trade packs, sync and evidence uploads. */
import express, { Router } from 'express';
import { eq } from 'drizzle-orm';
import {
  TradePack,
  type RegisterDeviceResponse,
  RegisterDeviceRequest,
} from '@hunarpramaan/contracts';
import { packagePack } from '@hunarpramaan/trade-packs';
import { devices } from '../db/schema';
import type { Deps } from '../domain/context';
import { deviceLost } from '../domain/accounts';
import { clipForAssessor, receiveUpload } from '../domain/evidence';
import { latestPack } from '../domain/packs';
import { pullUpdates, pushEvents } from '../domain/sync';
import { currentUser, requireAction, requireRead } from '../http/auth';
import { conflict, forbidden, notFound } from '../http/errors';
import { idParam } from '../http/params';
import { parse } from '../http/validate';

const FIELD_ROLES = new Set(['worker', 'mobiliser', 'assessor', 'master_assessor']);
const MAX_CLIP_BYTES = '64mb';

export function fieldRoutes(deps: Deps) {
  const router = Router();

  router.post('/v1/devices', requireAction('device.registered'), async (req, res) => {
    const user = currentUser(res);
    const input = parse(RegisterDeviceRequest, req.body);
    const [existing] = await deps.db.select().from(devices).where(eq(devices.id, input.deviceId));
    if (existing && existing.userId !== user.id)
      throw conflict('This device is bound to another account');
    // A phone reported lost stays lost; a retired one is returned as it is.
    if (existing?.status === 'lost') throw deviceLost();
    let device = existing;
    if (!device) {
      [device] = await deps.db
        .insert(devices)
        .values({
          id: input.deviceId,
          userId: user.id,
          label: input.label ?? null,
          registeredAt: deps.now(),
        })
        .returning();
    }
    if (!device) throw new Error('device insert returned no row');
    const body: RegisterDeviceResponse = {
      deviceId: device.id,
      userId: device.userId,
      registeredAt: device.registeredAt.toISOString(),
    };
    res.status(existing ? 200 : 201).json(body);
  });

  router.get('/v1/trade-packs/:id', requireRead('trade_packs.read'), async (req, res) => {
    const row = await latestPack(deps.db, String(req.params.id));
    if (!row) throw notFound('Trade pack');
    const { contents, sha256 } = packagePack(TradePack.parse(row.content));
    res
      .set('ETag', `"${sha256}"`)
      .set('X-Pack-Sha256', sha256)
      .type('application/json')
      .send(contents);
  });

  router.post('/v1/sync/push', async (req, res) => {
    const user = currentUser(res);
    if (!FIELD_ROLES.has(user.role)) throw forbidden(`${user.role} does not sync from a phone`);
    res.json(await pushEvents(deps, user, req.body));
  });

  router.get('/v1/sync/pull', async (req, res) => {
    const user = currentUser(res);
    if (!FIELD_ROLES.has(user.role)) throw forbidden(`${user.role} does not sync from a phone`);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(await pullUpdates(deps, user, cursor));
  });

  router.put(
    '/v1/evidence/:id/content',
    requireAction('evidence.captured'),
    express.raw({ type: () => true, limit: MAX_CLIP_BYTES }),
    async (req, res) => {
      if (!deps.store.acceptsApiUploads) throw notFound('Upload endpoint');
      const clip = await clipForAssessor(deps, currentUser(res), idParam(req));
      const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
      const outcome = await receiveUpload(deps, clip, bytes);
      res.status(outcome === 'stored' ? 204 : 422).end();
    },
  );

  router.post('/v1/evidence/:id/complete', requireAction('evidence.captured'), async (req, res) => {
    const clip = await clipForAssessor(deps, currentUser(res), idParam(req));
    await deps.queue.add({ name: 'evidence.rehash', data: { evidenceId: clip.id } });
    res.status(202).json({ evidenceId: clip.id, status: 'queued' });
  });

  return router;
}

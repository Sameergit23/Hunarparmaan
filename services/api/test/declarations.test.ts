import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DeclarationListItem, type Role } from '@hunarpramaan/contracts';
import type { SimulatedPhone } from '../src/dev/simulated-phone';
import { L3, PACK, startHarness, type Harness, type TestUser } from '../src/test/harness';
import { L4, buildDeclaration, pushOk, registerWorker } from '../src/test/scenario';

let h: Harness;
let mobiliser: TestUser;
let agency: TestUser;
let phone: SimulatedPhone;
let workerId: string;

beforeAll(async () => {
  h = await startHarness();
  mobiliser = await h.user('mobiliser', 'Sunita Verma');
  agency = await h.user('agency', 'Agency Desk');
  phone = await h.phone(mobiliser);
  workerId = await registerWorker(h, mobiliser, phone);
});
afterAll(() => h.close());

const [l3, l4] = PACK.qualifications;

/** GET /v1/declarations as `user`, checked against the contract; returns the one with `id`. */
async function listed(id: string, user = agency) {
  const res = await h.http.get('/v1/declarations').set(user.auth);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const items = z.array(DeclarationListItem).parse(res.body);
  return items.find((d) => d.id === id);
}

describe('GET /v1/declarations (walking skeleton: a declaration synced from the phone)', () => {
  it('lists the declaration, the AI suggestion and the mobiliser’s decision', async () => {
    h.tick();
    const { declarationId, events } = buildDeclaration(phone, workerId);
    await pushOk(h, mobiliser, phone, events);

    expect(await listed(declarationId)).toEqual({
      id: declarationId,
      workerName: 'Ramesh Kumar',
      language: 'hi',
      source: 'vosk',
      transcript: '10 saal se ghar ki wiring karta hoon, MCB lagata hoon',
      recordedAt: h.deps.now().toISOString(),
      suggestion: {
        engine: 'device_keyword',
        packVersion: PACK.pack.version,
        routingThreshold: PACK.policy.routingThreshold,
        coverage: [
          { nqrCode: L3, title: l3!.title, nsqfLevel: 3, coverage: 0.78 },
          { nqrCode: L4, title: l4!.title, nsqfLevel: 4, coverage: 0.52 },
        ],
        suggestedQp: { nqrCode: L3, title: l3!.title, nsqfLevel: 3 },
        suggestedRoute: 'direct_assessment',
        needsReview: false,
        suggestedAt: h.deps.now().toISOString(),
      },
      decision: {
        qp: { nqrCode: L3, title: l3!.title, nsqfLevel: 3 },
        route: 'direct_assessment',
        reason: null,
        overridden: false,
        decidedBy: 'Sunita Verma',
        decidedAt: h.deps.now().toISOString(),
        origin: 'device',
      },
    });
  });

  it('marks a decision that overrides the suggestion, with its reason (FR-04)', async () => {
    const { declarationId, events } = buildDeclaration(phone, workerId, {
      decision: {
        nqrCode: L3,
        route: 'bridge_module',
        reason: 'Has not used an earth tester yet',
      },
    });
    await pushOk(h, mobiliser, phone, events);

    expect((await listed(declarationId))?.decision).toMatchObject({
      route: 'bridge_module',
      reason: 'Has not used an earth tester yet',
      overridden: true,
    });
  });

  it('lists a declaration that has no suggestion or decision yet', async () => {
    const { declarationId, events } = buildDeclaration(phone, workerId, { mapped: false });
    await pushOk(h, mobiliser, phone, events);

    expect(await listed(declarationId)).toMatchObject({ suggestion: null, decision: null });
  });

  it('shows the newest decision: an online override after the phone’s', async () => {
    const { declarationId, events } = buildDeclaration(phone, workerId);
    await pushOk(h, mobiliser, phone, events);
    h.tick();
    const override = await h.http
      .post(`/v1/declarations/${declarationId}/override`)
      .set(mobiliser.auth)
      .send({ nqrCode: L4, route: 'bridge_module', reason: 'Wants the Level 4 bridge course' });
    expect(override.status).toBe(201);

    expect((await listed(declarationId))?.decision).toEqual({
      qp: { nqrCode: L4, title: l4!.title, nsqfLevel: 4 },
      route: 'bridge_module',
      reason: 'Wants the Level 4 bridge course',
      overridden: true,
      decidedBy: 'Sunita Verma',
      decidedAt: h.deps.now().toISOString(),
      origin: 'web',
    });
  });

  it('lets the awarding body read declarations too', async () => {
    const { declarationId, events } = buildDeclaration(phone, workerId);
    await pushOk(h, mobiliser, phone, events);
    expect(await listed(declarationId, await h.user('awarding_body'))).toBeDefined();
  });

  it.each<Role>(['ncvet', 'mobiliser', 'assessor', 'master_assessor', 'worker'])(
    'refuses %s (NCVET sees aggregates only; phone roles have no office reads)',
    async (role) => {
      const res = await h.http.get('/v1/declarations').set((await h.user(role)).auth);
      expect(res.status).toBe(403);
    },
  );

  it('needs a signed-in user', async () => {
    expect((await h.http.get('/v1/declarations')).status).toBe(401);
  });
});

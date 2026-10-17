import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import supertest from 'supertest';
import { pino } from 'pino';
import type { Actor, Role, SessionUser } from '@hunarpramaan/contracts';
import { loadPack } from '@hunarpramaan/trade-packs/node';
import { createApp } from '../app';
import { hashSecret } from '../auth/secrets';
import { createTokenIssuer } from '../auth/tokens';
import { loadConfig } from '../config';
import { devices, users } from '../db/schema';
import type { Deps } from '../domain/context';
import { publishPack } from '../domain/packs';
import { SimulatedPhone } from '../dev/simulated-phone';
import { InlineQueue } from '../queue/queue';
import { LocalObjectStore } from '../storage/object-store';
import { createJobHandler } from '../worker/jobs';
import { testDatabase } from './db';

export const L3 = 'QG-03-CO-03951-2025-V2-CSDCI';
export const PACK = loadPack('electrician');
export const L3_CRITERIA = PACK.qualifications[0]!.nos.flatMap((n) => n.criteria.map((c) => c.id));
export const PIN = '4826';

/** One app on a fresh database, with a clock and a dice the test controls. */
export async function startHarness() {
  const database = await testDatabase();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
    MOCK_INTEGRATIONS: 'true',
  });
  let now = new Date('2026-11-24T05:00:00.000Z');
  let dice = 0.99; // above the 10% sample rate: no random re-scores unless a test asks
  const queue = new InlineQueue();
  const deps: Deps = {
    db: database.db,
    config,
    store: new LocalObjectStore('http://api.test', null, () => now),
    queue,
    now: () => now,
    random: () => dice,
    newId: () => uuidv7(),
  };
  const logger = pino({ level: 'silent' });
  queue.setHandler(createJobHandler(deps, logger));
  const tokens = createTokenIssuer(config.JWT_SECRET, 12, () => now);
  await publishPack(database.db, PACK);
  const app = createApp({ ...deps, tokens, logger });
  const http = supertest(app);

  let phoneCount = 0;
  const harness = {
    app,
    http,
    deps,
    db: database.db,
    setNow(date: Date) {
      now = date;
    },
    /** Move the clock on, so events get distinct times. */
    tick(ms = 60_000) {
      now = new Date(now.getTime() + ms);
      return now;
    },
    setDice(value: number) {
      dice = value;
    },
    async user(role: Role, name = `${role} user`): Promise<TestUser> {
      const id = uuidv4();
      const phone = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
      await database.db
        .insert(users)
        .values({ id, role, name, phone, pinHash: await hashSecret(PIN) });
      const sessionUser: SessionUser = { id, role, name };
      const { token } = await tokens.issue(sessionUser);
      return {
        ...sessionUser,
        phone,
        token,
        actor: { kind: 'user', userId: id, role },
        auth: { Authorization: `Bearer ${token}` },
      };
    },
    /** A phone bound to `user`. */
    async phone(user: TestUser) {
      phoneCount += 1;
      const deviceId = `test-device-${phoneCount}`;
      await database.db
        .insert(devices)
        .values({ id: deviceId, userId: user.id, registeredAt: now });
      return new SimulatedPhone(deviceId, user.actor, () => now);
    },
    close: () => database.close(),
  };
  return harness;
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;

export interface TestUser extends SessionUser {
  phone: string;
  token: string;
  actor: Actor;
  auth: { Authorization: string };
}

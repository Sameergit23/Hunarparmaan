/**
 * pnpm db:seed: load the trade pack, demo users and a demo pilot.
 *
 * Every demo session goes through the real sync, upload and approval code,
 * so hash chains, checks, flags and certificates are all genuine. Names and
 * phone numbers are made up (rule 8). The study numbers are placeholders and
 * are marked `demo` until the real rater study runs.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import type {
  DeviceEventType,
  GeoPoint,
  Role,
  ScoreValue,
  SessionUser,
  SyncEventOf,
} from '@hunarpramaan/contracts';
import { qpResult } from '@hunarpramaan/scoring';
import { loadPack } from '@hunarpramaan/trade-packs/node';
import { hashSecret } from '../auth/secrets';
import { loadConfig, loadEnvFiles } from '../config';
import { SimulatedPhone, fakeClip } from '../dev/simulated-phone';
import { clipForAssessor, receiveUpload, rehashEvidence } from '../domain/evidence';
import { publishPack, qualificationLoader } from '../domain/packs';
import { decideRecommendation } from '../domain/recommendations';
import { recordRescore } from '../domain/rescores';
import { pushEvents } from '../domain/sync';
import { rescoreQueue } from '../domain/views';
import { createRuntime } from '../runtime';
import { devices, sessions, studyRounds, users } from './schema';

/** Demo PIN for every seeded account. */
export const DEMO_PIN = '1234';

const DEMO_USERS: { key: string; role: Role; name: string; phone: string }[] = [
  { key: 'mobiliser', role: 'mobiliser', name: 'Sunita Verma', phone: '9000000001' },
  { key: 'anil', role: 'assessor', name: 'Anil Sharma', phone: '9000000002' },
  { key: 'rekha', role: 'assessor', name: 'Rekha Nair', phone: '9000000003' },
  { key: 'vikram', role: 'assessor', name: 'Vikram Rathore', phone: '9000000004' },
  { key: 'master', role: 'master_assessor', name: 'Meena Iyer', phone: '9000000005' },
  { key: 'agency', role: 'agency', name: 'Indore Assessment Agency', phone: '9000000006' },
  { key: 'ssc', role: 'awarding_body', name: 'CSDCI Approvals Desk', phone: '9000000007' },
  { key: 'ncvet', role: 'ncvet', name: 'NCVET Monitoring', phone: '9000000008' },
];

const WORKERS = [
  'Ramesh Kumar',
  'Suresh Yadav',
  'Pooja Patel',
  'Imran Khan',
  'Lakshmi Devi',
  'Deepak Singh',
  'Kavita Joshi',
  'Arjun Meena',
];

const ITI_INDORE: GeoPoint = { lat: 22.7196, lng: 75.8577, accuracyM: 6, mocked: false };

type Plan = {
  assessor: 'anil' | 'rekha' | 'vikram';
  worker: number;
  /** Scores per criterion, in pack order. */
  scores: ScoreValue[];
  daysAgo: number;
  upload: 'all' | 'some' | 'tampered';
  sign: boolean;
  decision?: 'approved' | 'returned';
  awayM?: number;
  reuseFrom?: number;
};

// L3 has 8 criteria. Weighted results: all 2s = 100%, mostly 2s ≈ 85–95%, mixed ≈ 60–75%.
const PLANS: Plan[] = [
  {
    assessor: 'anil',
    worker: 0,
    scores: [2, 2, 2, 2, 1, 2, 2, 2],
    daysAgo: 12,
    upload: 'all',
    sign: true,
    decision: 'approved',
  },
  {
    assessor: 'anil',
    worker: 1,
    scores: [2, 1, 2, 2, 2, 1, 2, 2],
    daysAgo: 10,
    upload: 'all',
    sign: true,
    decision: 'approved',
  },
  {
    assessor: 'rekha',
    worker: 2,
    scores: [2, 2, 1, 2, 2, 2, 2, 1],
    daysAgo: 9,
    upload: 'all',
    sign: true,
    decision: 'approved',
  },
  {
    assessor: 'vikram',
    worker: 3,
    scores: [1, 0, 1, 2, 0, 1, 2, 1],
    daysAgo: 8,
    upload: 'all',
    sign: true,
    decision: 'returned',
  },
  {
    assessor: 'anil',
    worker: 4,
    scores: [2, 2, 2, 1, 2, 2, 1, 2],
    daysAgo: 5,
    upload: 'all',
    sign: true,
  },
  {
    assessor: 'rekha',
    worker: 5,
    scores: [2, 2, 2, 2, 2, 2, 1, 2],
    daysAgo: 4,
    upload: 'all',
    sign: true,
    awayM: 900,
  },
  {
    assessor: 'vikram',
    worker: 6,
    scores: [2, 2, 2, 2, 2, 2, 2, 2],
    daysAgo: 3,
    upload: 'tampered',
    sign: true,
    reuseFrom: 4,
  },
  {
    assessor: 'rekha',
    worker: 7,
    scores: [2, 1, 2, 2, 1, 2, 2, 2],
    daysAgo: 1,
    upload: 'some',
    sign: false,
  },
];

/** Share of each assessor's re-scored clips where the master disagrees: Vikram is the outlier. */
const MASTER_DISAGREES: Record<Plan['assessor'], number> = { anil: 0.17, rekha: 0.2, vikram: 0.6 };

function offsetNorth(point: GeoPoint, metres: number): GeoPoint {
  return { ...point, lat: point.lat + metres / 111_195 };
}

/** A tiny deterministic PRNG, so every seed run gives the same demo. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seed(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();
  const runtime = await createRuntime(config);
  const { deps } = runtime;
  const { db } = deps;
  if (runtime.database.driver === 'pglite') await runtime.database.migrate();

  const pack = loadPack('electrician');
  await publishPack(db, pack);
  console.log(`✓ trade pack ${pack.pack.id} ${pack.pack.version}`);

  const accounts = new Map<string, SessionUser>();
  for (const u of DEMO_USERS) {
    const [existing] = await db.select().from(users).where(eq(users.phone, u.phone));
    const id = existing?.id ?? uuidv4();
    if (!existing) {
      await db.insert(users).values({
        id,
        role: u.role,
        name: u.name,
        phone: u.phone,
        pinHash: await hashSecret(DEMO_PIN),
      });
    }
    accounts.set(u.key, { id, role: u.role, name: u.name });
  }
  console.log(
    `✓ ${DEMO_USERS.length} demo accounts (PIN ${DEMO_PIN}, OTP 123456 with MOCK_INTEGRATIONS=true)`,
  );

  if ((await db.select({ id: sessions.id }).from(sessions).limit(1)).length > 0) {
    console.log('• demo sessions already exist; nothing more to add');
    await runtime.close();
    return;
  }

  const account = (key: string) => {
    const user = accounts.get(key);
    if (!user) throw new Error(`no demo account ${key}`);
    return user;
  };
  const realNow = new Date();
  let clock = new Date(realNow.getTime() - 14 * 86_400_000);
  const phoneFor = async (key: string) => {
    const user = account(key);
    const deviceId = `demo-${key}-phone`;
    await db
      .insert(devices)
      .values({ id: deviceId, userId: user.id, label: 'Demo phone' })
      .onConflictDoNothing();
    return new SimulatedPhone(
      deviceId,
      { kind: 'user', userId: user.id, role: user.role },
      () => clock,
    );
  };
  const push = async (
    key: string,
    phone: SimulatedPhone,
    events: SyncEventOf<DeviceEventType>[],
  ) => {
    const res = await pushEvents(deps, account(key), phone.push(events, new Date()));
    const rejected = res.acks.filter((a) => a.status === 'rejected');
    if (rejected.length > 0) throw new Error(`seed push rejected: ${JSON.stringify(rejected)}`);
  };

  // Registration, consent and declarations by the mobiliser.
  const mobiliserPhone = await phoneFor('mobiliser');
  const workerIds: string[] = [];
  const [l3] = pack.qualifications;
  if (!l3) throw new Error('the pack has no qualifications');
  for (const [i, name] of WORKERS.entries()) {
    const workerId = uuidv4();
    workerIds.push(workerId);
    const declarationId = uuidv4();
    const covered = l3.nos
      .flatMap((n) => n.criteria.map((c) => c.id))
      .filter((_, j) => (i + j) % 4 !== 0);
    const suggestion = { nqrCode: l3.nqrCode, route: 'direct_assessment' as const };
    await push('mobiliser', mobiliserPhone, [
      mobiliserPhone.event('worker.registered', {
        workerId,
        name,
        phone: `90000001${String(i).padStart(2, '0')}`,
        language: 'hi',
        ekycRef: `EKYC-MOCK-${String(i + 1).padStart(4, '0')}`,
      }),
      mobiliserPhone.event('consent.given', {
        consentId: uuidv4(),
        workerId,
        noticeVersion: 'v1',
        language: 'hi',
        readAloud: true,
      }),
      mobiliserPhone.event('declaration.recorded', {
        declarationId,
        workerId,
        language: 'hi',
        source: 'vosk',
        asrTranscript: 'das saal se ghar ki wiring karta hoon mcb lagata hoon',
        transcript: '10 saal se ghar ki wiring karta hoon, MCB lagata hoon, earthing bhi deta hoon',
      }),
      mobiliserPhone.event(
        'mapping.suggested',
        {
          declarationId,
          packVersion: pack.pack.version,
          engine: 'device_keyword',
          results: [
            { nqrCode: l3.nqrCode, coverage: 0.78, coveredCriteria: covered, confidence: 0.7 },
          ],
          suggestedNqrCode: l3.nqrCode,
          suggestedRoute: 'direct_assessment',
          needsReview: false,
        },
        { actor: { kind: 'system', service: 'device-mapper' } },
      ),
      mobiliserPhone.event('route.decided', {
        declarationId,
        ...suggestion,
        suggested: suggestion,
      }),
    ]);
    clock = new Date(clock.getTime() + 3_600_000);
  }
  console.log(`✓ ${WORKERS.length} workers registered, with consent and declarations`);

  // Assessment sessions.
  const phones = new Map<string, SimulatedPhone>();
  const criteriaIds = l3.nos.flatMap((n) => n.criteria.map((c) => c.id));
  const sessionClips: { evidenceId: string; sha256: string; bytes: Uint8Array }[][] = [];
  const recommendationIds: (string | null)[] = [];
  deps.random = mulberry32(2026);

  for (const [p, plan] of PLANS.entries()) {
    const phone = phones.get(plan.assessor) ?? (await phoneFor(plan.assessor));
    phones.set(plan.assessor, phone);
    clock = new Date(realNow.getTime() - plan.daysAgo * 86_400_000 + 4 * 3_600_000);
    const sessionId = uuidv4();
    const events: SyncEventOf<DeviceEventType>[] = [
      phone.event('session.started', {
        sessionId,
        workerId: workerIds[plan.worker] ?? '',
        nqrCode: l3.nqrCode,
        packVersion: pack.pack.version,
        ekycRef: `EKYC-MOCK-${String(plan.worker + 1).padStart(4, '0')}`,
        startPhotoSha256: fakeClip(`start ${sessionId}`).sha256,
        gps: ITI_INDORE,
      }),
    ];
    const clips: { evidenceId: string; sha256: string; bytes: Uint8Array }[] = [];
    const scoreIds: string[] = [];
    const values = new Map<string, ScoreValue>();
    for (const [c, criterionId] of criteriaIds.entries()) {
      clock = new Date(clock.getTime() + 4 * 60_000);
      const reused =
        plan.reuseFrom !== undefined && c === 0 ? sessionClips[plan.reuseFrom]?.[0] : undefined;
      const clip = reused
        ? { sha256: reused.sha256, bytes: reused.bytes }
        : fakeClip(`${sessionId} ${criterionId}`);
      const evidenceId = uuidv7();
      clips.push({ evidenceId, ...clip });
      events.push(
        phone.event('evidence.captured', {
          evidenceId,
          sessionId,
          criterionId,
          sha256: clip.sha256,
          bytes: clip.bytes.length,
          mimeType: 'video/mp4',
          durationSec: 35 + ((c * 7) % 20),
          capturedAt: clock.toISOString(),
          gps: plan.awayM && c >= 5 ? offsetNorth(ITI_INDORE, plan.awayM) : ITI_INDORE,
        }),
      );
      const value = plan.scores[c] ?? 2;
      values.set(criterionId, value);
      // An AI hint the assessor disagreed with, on the safety-gear criterion.
      const aiFlags =
        criterionId === 'L3-N3.PC1'
          ? [{ check: 'ppe.gloves', raised: true, confidence: 0.82, source: 'device' as const }]
          : [];
      const score = phone.event('score.recorded', {
        sessionId,
        criterionId,
        value,
        evidenceIds: [evidenceId],
        aiFlags,
        ...(aiFlags.length && value === 2
          ? { conflictReason: 'Gloves worn; hands out of frame at the start' }
          : {}),
      });
      scoreIds.push(score.id);
      events.push(score);
    }
    sessionClips.push(clips);
    await push(plan.assessor, phone, events);

    // Uploads, through the same path a phone uses.
    const assessor = account(plan.assessor);
    for (const [c, clip] of clips.entries()) {
      if (plan.upload === 'some' && c >= 5) continue;
      const row = await clipForAssessor(deps, assessor, clip.evidenceId);
      const bytes =
        plan.upload === 'tampered' && c === 3
          ? new TextEncoder().encode('edited clip')
          : clip.bytes;
      if ((await receiveUpload(deps, row, bytes)) === 'stored')
        await rehashEvidence(deps, clip.evidenceId);
    }

    if (plan.sign) {
      clock = new Date(clock.getTime() + 10 * 60_000);
      const result = qpResult(l3, values);
      const recommendationId = uuidv4();
      await push(plan.assessor, phone, [
        phone.event('recommendation.signed', {
          recommendationId,
          sessionId,
          nqrCode: l3.nqrCode,
          packVersion: pack.pack.version,
          outcome: result.status === 'pass' ? 'pass' : 'fail',
          aggregate: result.value,
          nosTotals: result.nos.map((n) => ({ nosCode: n.code, fraction: n.fraction })),
          scoreEventIds: scoreIds,
        }),
      ]);
      recommendationIds.push(recommendationId);
    } else {
      recommendationIds.push(null);
    }
    console.log(`✓ session ${p + 1}: ${WORKERS[plan.worker]} with ${assessor.name}`);
  }

  // Blind re-scores by the master assessor.
  const master = account('master');
  const tasks = await rescoreQueue(db, master.id);
  const seen: Record<Plan['assessor'], number> = { anil: 0, rekha: 0, vikram: 0 };
  for (const task of tasks) {
    const p = sessionClips.findIndex((clips) =>
      clips.some((c) => c.evidenceId === task.evidenceId),
    );
    const plan = PLANS[p];
    const original = plan?.scores[criteriaIds.indexOf(task.criterionId)] ?? 2;
    // Spread disagreements evenly: clip k disagrees when the running share passes a whole number.
    let disagree = false;
    if (plan) {
      const k = seen[plan.assessor]++;
      const rate = MASTER_DISAGREES[plan.assessor];
      disagree = Math.floor((k + 1) * rate) > Math.floor(k * rate);
    }
    const value = (disagree ? (original === 2 ? 1 : original + 1) : original) as ScoreValue;
    await recordRescore(deps, master, { taskId: task.taskId, value });
  }
  console.log(`✓ ${tasks.length} clips re-scored blind`);

  // Awarding-body decisions.
  const ssc = account('ssc');
  for (const [p, plan] of PLANS.entries()) {
    const recommendationId = recommendationIds[p];
    const choice = plan.decision;
    if (!choice || !recommendationId) continue;
    const decision = await db.transaction((tx) =>
      decideRecommendation(tx, deps, qualificationLoader(tx), {
        recommendationId,
        decision: choice,
        note:
          choice === 'returned'
            ? 'Earthing clip is too dark to judge; please re-record PC2'
            : undefined,
        userId: ssc.id,
      }),
    );
    console.log(
      `✓ ${WORKERS[plan.worker]}: ${decision.decision}${decision.certificateId ? `, certificate ${decision.certificateId}` : ''}`,
    );
  }

  // Placeholder study numbers, shown as demo until Round A and Round B run.
  await db
    .insert(studyRounds)
    .values([
      {
        round: 'A',
        label: 'Unassisted',
        fleissKappa: 0.38,
        kappaCiLow: 0.27,
        kappaCiHigh: 0.49,
        krippendorffAlpha: 0.45,
        exactAgreement: 0.52,
        raters: 7,
        clips: 12,
        demo: true,
      },
      {
        round: 'B',
        label: 'With HunarPramaan',
        fleissKappa: 0.64,
        kappaCiLow: 0.54,
        kappaCiHigh: 0.73,
        krippendorffAlpha: 0.71,
        exactAgreement: 0.74,
        raters: 7,
        clips: 12,
        demo: true,
      },
    ])
    .onConflictDoNothing();
  console.log('✓ placeholder study rounds (marked demo)');

  await runtime.close();
}

// Run when started as a script (pnpm db:seed). pathToFileURL keeps this working on
// Windows, where process.argv[1] is a C:\ path and import.meta.url is file:///C:/...
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await seed();
}

/**
 * pnpm demo:vision: the AI checks end to end, against a running API.
 *
 * It plays the two phones over HTTP, exactly as the app will: the demo mobiliser
 * registers a worker, and the demo assessor records evidence with public photos
 * (and a short clip) from the safety-gear evaluation set, scores every criterion
 * full marks, syncs and uploads. The API re-hashes each clip and its queue sends
 * it to the AI service, whose hints then appear on the session page.
 *
 * Needs: `pnpm dev` with the seeded demo accounts, the AI service (`pnpm ai:dev`)
 * with AI_SERVICE_URL set for the API, and the evaluation images
 * (`pnpm ai:eval` downloads them). The photos show real people at work, under
 * open licences; they stay in the API's local evidence store and are never committed.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { sha256Hex } from '@hunarpramaan/audit';
import type {
  DeviceEventType,
  GeoPoint,
  LoginResponse,
  OtpResponse,
  SessionDetail,
  SyncEventOf,
  SyncPushResponse,
} from '@hunarpramaan/contracts';
import { loadPack } from '@hunarpramaan/trade-packs/node';
import { SimulatedPhone } from './simulated-phone';

const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
const PIN = '1234';
const ACCOUNTS = { mobiliser: '9000000001', assessor: '9000000002', agency: '9000000006' };
const VENUE: GeoPoint = { lat: 22.7196, lng: 75.8577, accuracyM: 6, mocked: false };

const EVAL = path.resolve(import.meta.dirname, '../../../../evaluation/safety-gear/raw');
/** Criterion → evidence: manifest ids of labelled public photos, or a clip under raw/. */
const EVIDENCE: Record<string, string> = {
  // Wear and check PPE (photo): bare hands, no helmet, sandals.
  'L3-N3.PC1': 'images/commons-6aeb2f7c.jpg',
  // Connect switches and sockets: a bare twisted joint on a plug pin.
  'L3-N1.PC2': 'images/commons-a9a58241.jpg',
  // Earth pit: grinding with sparks, no eye protection, bare hands.
  'L3-N2.PC1': 'images/commons-235be84c.jpg',
  // Lay conduit: an 18 s clip stitched from three photos of bare-handed work (pnpm ai:clip).
  'L3-N1.PC1': 'demo-clip.mp4',
};

async function call<T>(method: string, url: string, token: string | null, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body instanceof Uint8Array ? {} : { 'content-type': 'application/json' }),
    },
  };
  if (body !== undefined) init.body = body instanceof Uint8Array ? body : JSON.stringify(body);
  const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, init);
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

async function signIn(phone: string) {
  const otp = await call<OtpResponse>('POST', '/v1/auth/otp', null, { phone });
  if (!otp.mockCode) throw new Error('the API must run with MOCK_INTEGRATIONS=true');
  const login = await call<LoginResponse>('POST', '/v1/auth/login', null, {
    challengeId: otp.challengeId,
    otp: otp.mockCode,
    pin: PIN,
  });
  return login;
}

async function phoneFor(login: LoginResponse) {
  // A new device id each run: every phone has its own hash chain from entry 1.
  const deviceId = `demo-vision-${login.user.role}-${Date.now().toString(36)}`;
  await call('POST', '/v1/devices', login.token, { deviceId, label: 'Vision demo' });
  return new SimulatedPhone(deviceId, {
    kind: 'user',
    userId: login.user.id,
    role: login.user.role,
  });
}

async function push(
  login: LoginResponse,
  phone: SimulatedPhone,
  events: SyncEventOf<DeviceEventType>[],
) {
  const res = await call<SyncPushResponse>(
    'POST',
    '/v1/sync/push',
    login.token,
    phone.push(events),
  );
  const refused = res.acks.filter((a) => a.status === 'rejected');
  if (refused.length) throw new Error(`push refused: ${JSON.stringify(refused)}`);
  return res;
}

async function main() {
  const missing = Object.values(EVIDENCE).filter((f) => !existsSync(path.join(EVAL, f)));
  if (missing.length) {
    console.error(
      `Missing ${missing.join(', ')} under ${EVAL}.\n` +
        'Run `pnpm ai:eval` once to download the images, then `pnpm ai:clip` for the clip.',
    );
    process.exit(1);
  }
  const pack = loadPack('electrician');
  const [l3] = pack.qualifications;
  if (!l3) throw new Error('the pack has no qualifications');

  const mobiliser = await signIn(ACCOUNTS.mobiliser);
  const assessor = await signIn(ACCOUNTS.assessor);
  const agency = await signIn(ACCOUNTS.agency);

  const mobiliserPhone = await phoneFor(mobiliser);
  const workerId = uuidv4();
  await push(mobiliser, mobiliserPhone, [
    mobiliserPhone.event('worker.registered', {
      workerId,
      // Made up (rule 8).
      name: 'Mohan Lal',
      phone: '9000000199',
      language: 'hi',
      ekycRef: 'EKYC-MOCK-0199',
    }),
    mobiliserPhone.event('consent.given', {
      consentId: uuidv4(),
      workerId,
      noticeVersion: 'v1',
      language: 'hi',
      readAloud: true,
    }),
  ]);

  const phone = await phoneFor(assessor);
  const sessionId = uuidv4();
  const events: SyncEventOf<DeviceEventType>[] = [
    phone.event('session.started', {
      sessionId,
      workerId,
      nqrCode: l3.nqrCode,
      packVersion: pack.pack.version,
      ekycRef: 'EKYC-MOCK-0199',
      startPhotoSha256: sha256Hex(new TextEncoder().encode(`start ${sessionId}`)),
      gps: VENUE,
    }),
  ];
  const clips = new Map<string, Uint8Array>();
  for (const [criterionId, file] of Object.entries(EVIDENCE)) {
    const bytes = new Uint8Array(readFileSync(path.join(EVAL, file)));
    const evidenceId = uuidv7();
    clips.set(evidenceId, bytes);
    const video = file.endsWith('.mp4');
    events.push(
      phone.event('evidence.captured', {
        evidenceId,
        sessionId,
        criterionId,
        sha256: sha256Hex(bytes),
        bytes: bytes.length,
        mimeType: video ? 'video/mp4' : 'image/jpeg',
        ...(video ? { durationSec: 18 } : {}),
        capturedAt: new Date().toISOString(),
        gps: VENUE,
      }),
      // Full marks everywhere, as an assessor might give offline before any AI check ran.
      phone.event('score.recorded', {
        sessionId,
        criterionId,
        value: 2,
        evidenceIds: [evidenceId],
        aiFlags: [],
      }),
    );
  }
  const pushed = await push(assessor, phone, events);
  console.log(`✓ session ${sessionId}: ${clips.size} clips recorded and synced`);

  for (const upload of pushed.uploads) {
    const bytes = clips.get(upload.evidenceId);
    if (!bytes) continue;
    const ours = upload.url.startsWith(API);
    await call('PUT', upload.url, ours ? assessor.token : null, bytes);
    await call('POST', `/v1/evidence/${upload.evidenceId}/complete`, assessor.token);
  }
  console.log('✓ clips uploaded; the API re-hashes them and asks the AI service');

  // The AI service takes about 10 s a frame on a laptop CPU.
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const detail = await call<SessionDetail>('GET', `/v1/sessions/${sessionId}`, agency.token);
    const done = detail.criteria.filter((c) => c.aiResults.length > 0);
    process.stdout.write(`\r  AI results for ${done.length} of ${clips.size} clips`);
    if (done.length >= clips.size || Date.now() > deadline) {
      console.log('');
      for (const c of done) {
        for (const check of c.aiResults.flatMap((r) => r.checks)) {
          console.log(
            `  ${c.criterionId} ${check.check}: ${check.status} (${Math.round(check.confidence * 100)}%)`,
          );
        }
      }
      if (done.length < clips.size) {
        console.log(
          '  Some clips have no result yet: is the AI service running, and AI_SERVICE_URL set?',
        );
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  console.log(
    `\nOpen ${WEB}/sessions/${sessionId} (sign in as the agency, 9000000006, PIN ${PIN}).`,
  );
}

await main();

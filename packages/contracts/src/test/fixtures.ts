import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import type { Actor } from '../roles';
import type { TradePack } from '../trade-pack';

export const ids = { v4: uuidv4, v7: uuidv7 };

export const assessor: Actor = { kind: 'user', userId: uuidv4(), role: 'assessor' };
export const mobiliser: Actor = { kind: 'user', userId: uuidv4(), role: 'mobiliser' };
export const worker: Actor = { kind: 'user', userId: uuidv4(), role: 'worker' };
export const queueWorker: Actor = { kind: 'system', service: 'queue-worker' };
export const deviceMapper: Actor = { kind: 'system', service: 'device-mapper' };

const HASH = 'a'.repeat(64);

/** An envelope with placeholder hashes; chain tests seal real ones. */
export function envelope(actor: Actor, seq = 1) {
  return {
    id: uuidv7(),
    deviceId: 'device-01',
    seq,
    prevHash: '0'.repeat(64),
    hash: HASH,
    occurredAt: '2026-10-19T10:15:00+05:30',
    actor,
  };
}

export const gps = { lat: 23.2599, lng: 77.4126, accuracyM: 8, mocked: false };

const t = (en: string) => ({ en, hi: `${en} (हिंदी)` });

export function minimalPack(): TradePack {
  return {
    schemaVersion: '1.0',
    pack: { id: 'test-pack', version: '2026.10.0', status: 'draft', languages: ['hi', 'en'] },
    policy: { routingThreshold: 0.7, reviewBand: { low: 0.65, high: 0.75 } },
    qualifications: [
      {
        nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
        title: t('Assistant Electrician'),
        nsqfLevel: 3,
        awardingBody: 'CSDCI',
        passRule: { aggregatePercent: 70 },
        nos: [
          {
            code: 'NOS-A',
            title: t('Wiring'),
            weight: 0.6,
            criteria: [
              {
                id: 'NOS-A.PC1',
                text: t('Lay wiring through conduit'),
                marks: 10,
                glossary: ['wiring', 'pipe me taar'],
                rubric: {
                  '0': t('Cannot do it'),
                  '1': t('Does it with errors'),
                  '2': t('Does it right'),
                },
                evidence: { type: 'video', minSeconds: 30, maxSeconds: 60 },
                aiChecks: ['ppe.gloves'],
              },
            ],
          },
          {
            code: 'NOS-B',
            title: t('Earthing'),
            weight: 0.4,
            criteria: [
              {
                id: 'NOS-B.PC1',
                text: t('Measure earth resistance'),
                marks: 5,
                glossary: ['earthing'],
                rubric: {
                  '0': t('Cannot do it'),
                  '1': t('Does it with errors'),
                  '2': t('Does it right'),
                },
                evidence: { type: 'photo' },
                aiChecks: [],
              },
            ],
          },
        ],
      },
    ],
    calibrationClips: [
      {
        id: 'calib-01',
        nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
        criterionId: 'NOS-A.PC1',
        masterScore: 1,
      },
    ],
    models: { asr: 'vosk-model-small-hi-0.22' },
  };
}

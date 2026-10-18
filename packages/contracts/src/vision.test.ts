import { describe, expect, it } from 'vitest';
import {
  VISION_CHECK_IDS,
  VisionCheckResult,
  VisionReport,
  checksForCriterion,
  toAiFlags,
  type VisionCheckResult as Result,
} from './vision';
import { AiFlag } from './events';

const result = (over: Partial<Result> = {}): Result => ({
  check: 'ppe.gloves',
  status: 'raised',
  confidence: 0.82,
  framesSeen: 9,
  framesTotal: 12,
  moments: [3, 7.5],
  params: { reason: 'bare_hand' },
  ...over,
});

describe('the check catalogue', () => {
  it('uses ids the trade pack accepts and the AI flag shape allows', () => {
    for (const id of VISION_CHECK_IDS) {
      expect(id).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(
        AiFlag.safeParse({ check: id, raised: true, confidence: 1, source: 'server' }).success,
      ).toBe(true);
    }
  });

  it('runs every always-on check, plus the criterion’s own', () => {
    const checks = checksForCriterion(['ppe.gloves', 'step.order'], 'video');
    expect(checks).toContain('ppe.gloves');
    expect(checks).toContain('step.order');
    expect(checks).toContain('evidence.multiple_people');
    expect(checks).toContain('quality.too_short');
    expect(checks).not.toContain('ppe.helmet');
  });

  it('skips video-only checks on a photo, and ids it does not know', () => {
    const checks = checksForCriterion(['ppe.helmet', 'ppe.unicorn_hat'], 'photo');
    expect(checks).toContain('ppe.helmet');
    expect(checks).not.toContain('quality.shaky');
    expect(checks).not.toContain('evidence.static_image');
    expect(checks.join()).not.toContain('unicorn');
  });
});

describe('VisionCheckResult', () => {
  it('accepts a raised result with its confidence', () => {
    expect(VisionCheckResult.parse(result())).toEqual(result());
  });

  it('needs a confidence exactly when the check looked', () => {
    expect(VisionCheckResult.safeParse(result({ status: 'not_visible' })).success).toBe(false);
    expect(
      VisionCheckResult.safeParse(
        result({ status: 'not_visible', confidence: null, framesSeen: 0 }),
      ).success,
    ).toBe(true);
    expect(VisionCheckResult.safeParse(result({ status: 'clear', confidence: null })).success).toBe(
      false,
    );
  });

  it('refuses more frames seen than analysed', () => {
    expect(VisionCheckResult.safeParse(result({ framesSeen: 13 })).success).toBe(false);
  });

  it('allows at most three moments', () => {
    expect(VisionCheckResult.safeParse(result({ moments: [1, 2, 3, 4] })).success).toBe(false);
  });
});

describe('VisionReport', () => {
  it('parses a full report', () => {
    const report = {
      reportVersion: 1,
      engine: 'hp-ai 0.1.0',
      models: { clip: 'ViT-B-32/laion400m_e32', pose: 'pose_landmarker_lite' },
      video: {
        kind: 'video',
        durationSec: 41.2,
        width: 854,
        height: 480,
        framesDecoded: 160,
        framesAnalysed: 24,
      },
      checks: [result(), result({ check: 'quality.dark', status: 'clear', confidence: 0.02 })],
      phash: {
        algorithm: 'dct64',
        intervalSec: 1,
        frames: ['00ff00ff00ff00ff', 'a1b2c3d4e5f60718'],
      },
      timingMs: 8120,
    };
    expect(VisionReport.parse(report)).toEqual(report);
    expect(
      VisionReport.safeParse({ ...report, phash: { ...report.phash, frames: ['XYZ'] } }).success,
    ).toBe(false);
  });
});

describe('toAiFlags', () => {
  it('turns looked-at results into the flags the assessor sees', () => {
    const flags = toAiFlags(
      [
        result(),
        result({ check: 'ppe.helmet', status: 'clear', confidence: 0.1 }),
        result({ check: 'ppe.footwear', status: 'not_visible', confidence: null, framesSeen: 0 }),
        result({ check: 'hazard.water', status: 'uncertain', confidence: 0.5 }),
      ],
      'device',
    );
    expect(flags).toEqual([
      { check: 'ppe.gloves', raised: true, confidence: 0.82, source: 'device' },
      { check: 'ppe.helmet', raised: false, confidence: 0.1, source: 'device' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { TradePack } from './trade-pack';
import { minimalPack } from './test/fixtures';

function issues(pack: unknown): string[] {
  const result = TradePack.safeParse(pack);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('TradePack schema', () => {
  it('accepts a well-formed pack', () => {
    expect(issues(minimalPack())).toEqual([]);
  });

  it('rejects NOS weights that do not sum to 1', () => {
    const pack = minimalPack();
    pack.qualifications[0]!.nos[0]!.weight = 0.5;
    expect(issues(pack)).toEqual([expect.stringMatching(/sum to 1/)]);
  });

  it('allows rounding in the weights', () => {
    const pack = minimalPack();
    pack.qualifications[0]!.nos[0]!.weight = 0.6000000001;
    expect(issues(pack)).toEqual([]);
  });

  it('rejects duplicate criterion ids within a qualification', () => {
    const pack = minimalPack();
    pack.qualifications[0]!.nos[1]!.criteria[0]!.id = 'NOS-A.PC1';
    expect(issues(pack)).toContainEqual(expect.stringMatching(/duplicate criterion id/));
  });

  it('rule 7: rejects a criterion without Hindi text', () => {
    const pack = minimalPack() as unknown as {
      qualifications: { nos: { criteria: { text: object }[] }[] }[];
    };
    pack.qualifications[0]!.nos[0]!.criteria[0]!.text = { en: 'Lay wiring' };
    expect(issues(pack).length).toBeGreaterThan(0);
  });

  it('rejects a pack that does not cover both languages', () => {
    const pack = minimalPack();
    pack.pack.languages = ['en'];
    expect(issues(pack)).toContainEqual(expect.stringMatching(/Hindi and English/));
  });

  it('rejects a calibration clip for a criterion the QP does not have', () => {
    const pack = minimalPack();
    pack.calibrationClips[0]!.criterionId = 'NOS-Z.PC9';
    expect(issues(pack)).toContainEqual(expect.stringMatching(/no criterion NOS-Z.PC9/));
  });

  it('rejects a review band that does not contain the routing threshold', () => {
    const pack = minimalPack();
    pack.policy.reviewBand = { low: 0.75, high: 0.8 };
    expect(issues(pack)).toContainEqual(expect.stringMatching(/review band/));
  });

  it('rejects a video spec whose minimum is above its maximum', () => {
    const pack = minimalPack();
    pack.qualifications[0]!.nos[0]!.criteria[0]!.evidence = {
      type: 'video',
      minSeconds: 90,
      maxSeconds: 60,
    };
    expect(issues(pack)).toContainEqual(expect.stringMatching(/minSeconds/));
  });

  it('rejects an NQR code in the wrong format', () => {
    const pack = minimalPack();
    pack.qualifications[0]!.nqrCode = 'ELEC-L3';
    expect(issues(pack)).toContainEqual(expect.stringMatching(/NQR code/));
  });

  it('rejects unknown fields, so typos in a pack do not pass silently', () => {
    const pack = { ...minimalPack(), extra: true };
    expect(issues(pack).length).toBeGreaterThan(0);
  });
});

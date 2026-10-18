import { describe, expect, it } from 'vitest';
import type { ScoreValue } from '@hunarpramaan/contracts';
import { coverage } from './coverage';
import { qpResult } from './result';
import { ALL_CRITERIA, sampleQp } from './test/fixtures';

const scores = (entries: Record<string, ScoreValue>) => new Map(Object.entries(entries));
const every = (value: ScoreValue) =>
  scores(Object.fromEntries(ALL_CRITERIA.map((id) => [id, value])));

describe('qpResult', () => {
  it('gives 1 and a pass when every criterion scores 2', () => {
    const result = qpResult(sampleQp(), every(2));
    expect(result.value).toBeCloseTo(1, 12);
    expect(result.status).toBe('pass');
  });

  it('gives half marks for a 1', () => {
    const result = qpResult(sampleQp(), every(1));
    expect(result.value).toBeCloseTo(0.5, 12);
    expect(result.status).toBe('fail');
  });

  it('works through a mixed example', () => {
    // A: (10×2/2 + 10×1/2)/20 = 0.75 → 0.375; B: (0 + 15)/20 = 0.75 → 0.225; C: 1 → 0.2
    const result = qpResult(
      sampleQp(),
      scores({ 'A.PC1': 2, 'A.PC2': 1, 'B.PC1': 0, 'B.PC2': 2, 'C.PC1': 2 }),
    );
    expect(result.value).toBeCloseTo(0.8, 12);
    expect(result.nos.map((n) => n.fraction)).toEqual([0.75, 0.75, 1]);
    expect(result.status).toBe('pass');
  });

  it('passes at exactly the pass mark', () => {
    const result = qpResult(
      sampleQp(),
      scores({ 'A.PC1': 2, 'A.PC2': 2, 'B.PC1': 0, 'B.PC2': 0, 'C.PC1': 2 }),
    );
    expect(result.value).toBeCloseTo(0.7, 12);
    expect(result.status).toBe('pass');
  });

  it('is incomplete until every criterion is scored', () => {
    const result = qpResult(sampleQp(), scores({ 'A.PC1': 2, 'A.PC2': 2, 'C.PC1': 2 }));
    expect(result.status).toBe('incomplete');
    expect(result.missing).toEqual(['B.PC1', 'B.PC2']);
  });

  it('fails a NOS below the per-NOS floor even when the aggregate passes', () => {
    const qp = sampleQp({ aggregatePercent: 70, minNosPercent: 50 });
    const result = qpResult(
      qp,
      scores({ 'A.PC1': 2, 'A.PC2': 2, 'B.PC1': 0, 'B.PC2': 0, 'C.PC1': 2 }),
    );
    expect(result.failedNos).toEqual(['B']);
    expect(result.status).toBe('fail');
  });

  it('uses the same weighting as coverage', () => {
    expect(qpResult(sampleQp(), every(2)).value).toBe(coverage(sampleQp(), ALL_CRITERIA).value);
  });

  it('throws on a score that is not 0, 1 or 2', () => {
    expect(() => qpResult(sampleQp(), new Map([['A.PC1', 3 as ScoreValue]]))).toThrow(RangeError);
  });

  it('throws on a criterion that is not in the QP', () => {
    expect(() => qpResult(sampleQp(), scores({ 'Z.PC9': 2 }))).toThrow(/no criterion/);
  });
});

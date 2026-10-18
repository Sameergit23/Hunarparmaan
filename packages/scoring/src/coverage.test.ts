import { describe, expect, it } from 'vitest';
import { coverage, suggestRoute } from './coverage';
import { ALL_CRITERIA, policy, sampleQp } from './test/fixtures';

describe('coverage', () => {
  it('is 0 when nothing is covered', () => {
    const result = coverage(sampleQp(), []);
    expect(result.value).toBe(0);
    expect(result.gaps).toEqual(ALL_CRITERIA);
    expect(result.gapNos).toEqual(['A', 'B', 'C']);
  });

  it('is 1 when everything is covered', () => {
    const result = coverage(sampleQp(), ALL_CRITERIA);
    expect(result.value).toBeCloseTo(1, 12);
    expect(result.gaps).toEqual([]);
    expect(result.gapNos).toEqual([]);
  });

  it('weights each NOS by its share of the QP and each criterion by its marks', () => {
    // A: 10/20 × 0.5 = 0.25; B: 15/20 × 0.3 = 0.225
    const result = coverage(sampleQp(), ['A.PC1', 'B.PC2']);
    expect(result.value).toBeCloseTo(0.475, 12);
    expect(result.nos.map((n) => n.fraction)).toEqual([0.5, 0.75, 0]);
    expect(result.covered).toEqual(['A.PC1', 'B.PC2']);
    expect(result.gaps).toEqual(['A.PC2', 'B.PC1', 'C.PC1']);
  });

  it('gives more for a criterion with more marks', () => {
    const heavy = coverage(sampleQp(), ['B.PC2']).value;
    const light = coverage(sampleQp(), ['B.PC1']).value;
    expect(heavy).toBeGreaterThan(light);
  });

  it('ignores repeated ids', () => {
    expect(coverage(sampleQp(), ['C.PC1', 'C.PC1']).value).toBeCloseTo(0.2, 12);
  });

  it('throws on a criterion that is not in the QP', () => {
    expect(() => coverage(sampleQp(), ['Z.PC9'])).toThrow(/no criterion Z.PC9/);
  });
});

describe('suggestRoute (the 70% rule)', () => {
  it('routes exactly 0.700 to direct assessment', () => {
    expect(suggestRoute(0.7, policy).route).toBe('direct_assessment');
  });

  it('routes 0.699 to a bridge module', () => {
    expect(suggestRoute(0.699, policy).route).toBe('bridge_module');
  });

  it('treats a floating-point near miss of 0.70 as 0.70', () => {
    expect(suggestRoute(0.7 - 1e-12, policy).route).toBe('direct_assessment');
  });

  it('routes a declaration that covers NOS A and C (0.5 + 0.2) to direct assessment', () => {
    const value = coverage(sampleQp(), ['A.PC1', 'A.PC2', 'C.PC1']).value;
    expect(suggestRoute(value, policy)).toEqual({ route: 'direct_assessment', needsReview: true });
  });

  it.each([
    [0.64, 'bridge_module', false],
    [0.65, 'bridge_module', true],
    [0.72, 'direct_assessment', true],
    [0.75, 'direct_assessment', true],
    [0.76, 'direct_assessment', false],
    [0, 'bridge_module', false],
    [1, 'direct_assessment', false],
  ] as const)('coverage %d → %s, review %s', (value, route, needsReview) => {
    expect(suggestRoute(value, policy)).toEqual({ route, needsReview });
  });

  it('throws on coverage outside 0 to 1', () => {
    expect(() => suggestRoute(1.2, policy)).toThrow(RangeError);
    expect(() => suggestRoute(Number.NaN, policy)).toThrow(RangeError);
  });
});

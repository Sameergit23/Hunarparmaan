import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@hunarpramaan/audit';
import { coverage, qpResult, suggestRoute } from '@hunarpramaan/scoring';
import type { ScoreValue, TradePack } from '@hunarpramaan/contracts';
import { packagePack, releaseProblems, validatePack } from './index';

const raw: unknown = JSON.parse(
  readFileSync(new URL('../packs/electrician/pack.json', import.meta.url), 'utf8'),
);

function loadPack(): TradePack {
  const result = validatePack(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.pack;
}

const L3 = 'QG-03-CO-03951-2025-V2-CSDCI';
const L4 = 'QG-04-CO-03952-2025-V2-CSDCI';

describe('electrician trade pack', () => {
  it('passes the trade-pack schema', () => {
    expect(validatePack(raw)).toMatchObject({ ok: true });
  });

  it('covers the pilot QP (Level 3) and the Level 4 QP', () => {
    const pack = loadPack();
    expect(pack.qualifications.map((q) => [q.nqrCode, q.nsqfLevel])).toEqual([
      [L3, 3],
      [L4, 4],
    ]);
  });

  it('is marked as a draft until the domain lead fills it from the NQR QP files', () => {
    const pack = loadPack();
    expect(pack.pack.status).toBe('draft');
    expect(releaseProblems(pack)).toContainEqual(expect.stringMatching(/placeholder NOS codes/));
  });

  it('cannot be released while it holds placeholder data', () => {
    const pack = loadPack();
    const released = { ...pack, pack: { ...pack.pack, status: 'released' } };
    expect(validatePack(released)).toMatchObject({ ok: false });
  });

  it('maps the README example declaration and routes it to a bridge module', () => {
    // "15 saal se ghar ki wiring karta hoon, MCB lagata hoon, earthing bhi deta hoon"
    const pack = loadPack();
    const l3 = pack.qualifications.find((q) => q.nqrCode === L3)!;
    const result = coverage(l3, ['L3-N1.PC1', 'L3-N1.PC3', 'L3-N2.PC1']);
    // N1: 20/30 × 0.4 + N2: 10/25 × 0.3 = 0.2667 + 0.12
    expect(result.value).toBeCloseTo(0.38667, 4);
    expect(suggestRoute(result.value, pack.policy).route).toBe('bridge_module');
    expect(result.gapNos).toEqual(['DRAFT-L3-N1', 'DRAFT-L3-N2', 'DRAFT-L3-N3']);
  });

  it('gives full marks a pass and all ones a fail on both QPs', () => {
    for (const q of loadPack().qualifications) {
      const ids = q.nos.flatMap((n) => n.criteria.map((c) => c.id));
      const every = (v: ScoreValue) => new Map(ids.map((id) => [id, v]));
      expect(qpResult(q, every(2)).status, q.nqrCode).toBe('pass');
      expect(qpResult(q, every(1)).status, q.nqrCode).toBe('fail');
    }
  });

  it('packages to canonical JSON whose hash phones can check', () => {
    const out = packagePack(loadPack());
    expect(out.fileName).toBe('csdci-electrician-2026.10.0.json');
    expect(out.sha256).toBe(sha256Hex(out.contents));
    expect(JSON.parse(out.contents)).toEqual(loadPack());
  });
});

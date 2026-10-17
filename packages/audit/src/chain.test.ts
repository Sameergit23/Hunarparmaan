import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, entryHash, seal, verifyChain, type ChainLink } from './chain';

interface Entry extends ChainLink {
  event: string;
  payload: Record<string, unknown>;
}

function buildChain(deviceId: string, events: string[], after: Entry | null = null): Entry[] {
  const chain: Entry[] = [];
  let prev: Entry | null = after;
  for (const [i, event] of events.entries()) {
    prev = seal<Entry>(prev, { deviceId, event, payload: { n: i, sha256: 'ab'.repeat(32) } });
    chain.push(prev);
  }
  return chain;
}

describe('seal', () => {
  it('starts each device at seq 1 after the genesis hash', () => {
    const [first] = buildChain('dev-1', ['session.started']);
    expect(first).toMatchObject({ seq: 1, prevHash: GENESIS_HASH });
    expect(first?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('links each entry to the hash of the one before', () => {
    const [a, b] = buildChain('dev-1', ['session.started', 'evidence.captured']);
    expect(b?.seq).toBe(2);
    expect(b?.prevHash).toBe(a?.hash);
  });

  it('hashes the entry without its own hash field', () => {
    const [entry] = buildChain('dev-1', ['session.started']);
    expect(entry && entryHash(entry)).toBe(entry?.hash);
  });

  it('refuses to chain entries from two devices', () => {
    const [entry] = buildChain('dev-1', ['session.started']);
    expect(() => seal(entry ?? null, { deviceId: 'dev-2' })).toThrow(/dev-2/);
  });
});

describe('verifyChain', () => {
  const events = [
    'session.started',
    'evidence.captured',
    'score.recorded',
    'recommendation.signed',
  ];

  it('accepts an untouched chain', () => {
    const chain = buildChain('dev-1', events);
    expect(verifyChain(chain)).toEqual({ ok: true, count: 4, head: chain[3] });
  });

  it('accepts an empty chain', () => {
    expect(verifyChain([])).toEqual({ ok: true, count: 0, head: null });
  });

  it('IT-02: editing one row fails verification at that row', () => {
    const chain = buildChain('dev-1', events);
    chain[2] = { ...chain[2]!, payload: { n: 2, value: 2 } };
    expect(verifyChain(chain)).toEqual({ ok: false, index: 2, seq: 3, reason: 'hash_mismatch' });
  });

  it('catches an edited row whose hash was recomputed, at the next row', () => {
    const chain = buildChain('dev-1', events);
    const edited = { ...chain[1]!, payload: { n: 1, sha256: 'cd'.repeat(32) } };
    chain[1] = { ...edited, hash: entryHash(edited) };
    expect(verifyChain(chain)).toMatchObject({ ok: false, index: 2, reason: 'prev_hash_mismatch' });
  });

  it('catches a deleted row', () => {
    const chain = buildChain('dev-1', events);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toMatchObject({ ok: false, index: 1, reason: 'seq_gap' });
  });

  it('catches reordered rows', () => {
    const chain = buildChain('dev-1', events);
    [chain[1], chain[2]] = [chain[2]!, chain[1]!];
    expect(verifyChain(chain)).toMatchObject({ ok: false, index: 1, reason: 'seq_gap' });
  });

  it('catches an entry from another device', () => {
    const chain = [...buildChain('dev-1', events.slice(0, 2)), ...buildChain('dev-2', events)];
    expect(verifyChain(chain)).toMatchObject({ ok: false, index: 2, reason: 'device_mismatch' });
  });

  it('rejects a hash that is not lowercase SHA-256 hex', () => {
    const chain = buildChain('dev-1', events);
    chain[0] = { ...chain[0]!, hash: chain[0]!.hash.toUpperCase() };
    expect(verifyChain(chain)).toMatchObject({ ok: false, index: 0, reason: 'bad_hash_format' });
  });

  it('reports a value that cannot be canonicalised instead of throwing', () => {
    const chain = buildChain('dev-1', events);
    chain[0] = { ...chain[0]!, payload: { reading: Number.NaN } };
    expect(verifyChain(chain)).toMatchObject({ ok: false, index: 0, reason: 'not_canonical' });
  });

  it('checks a sync batch as a continuation of what is already stored', () => {
    const stored = buildChain('dev-1', events.slice(0, 2));
    const batch = buildChain('dev-1', events.slice(2), stored[1]);
    expect(verifyChain(batch, { after: stored[1] })).toMatchObject({ ok: true, count: 2 });
    expect(verifyChain(batch)).toMatchObject({ ok: false, index: 0, reason: 'seq_gap' });
  });

  it('rejects a batch that forks from the stored chain', () => {
    const stored = buildChain('dev-1', events.slice(0, 2));
    const fork = buildChain('dev-1', ['score.recorded'], stored[0]);
    // Same seq as stored[1], but chained to stored[0]: it is not a continuation.
    expect(verifyChain(fork, { after: stored[1] })).toMatchObject({ ok: false, reason: 'seq_gap' });
  });
});

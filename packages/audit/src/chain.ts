/**
 * Per-device hash chain (README "Evidence integrity").
 *
 * Every entry carries the hash of the entry before it, and its own hash is the
 * SHA-256 of its canonical JSON without the `hash` field. There is one chain per
 * device, so offline phones never need to coordinate; seq starts at 1.
 */
import { CanonicalizationError } from './canonical';
import { SHA256_HEX, hashCanonical } from './hash';

/** prevHash of the first entry on a device. */
export const GENESIS_HASH = '0'.repeat(64);

export interface ChainLink {
  deviceId: string;
  seq: number;
  prevHash: string;
  hash: string;
}

/** An entry body before it is sealed into the chain. */
export type Unsealed<T extends ChainLink> = Omit<T, 'seq' | 'prevHash' | 'hash'>;

/** The hash an entry should have: SHA-256 over its canonical JSON, minus `hash`. */
export function entryHash(entry: Omit<ChainLink, 'hash'> & object): string {
  const { hash: _ignored, ...body } = entry as ChainLink;
  return hashCanonical(body);
}

/** Append `body` after `prev` (null for a device's first entry). */
export function seal<T extends ChainLink>(prev: ChainLink | null, body: Unsealed<T>): T {
  if (prev && prev.deviceId !== body.deviceId) {
    throw new Error(`Cannot chain an entry for ${body.deviceId} after one for ${prev.deviceId}`);
  }
  const linked = {
    ...body,
    seq: prev ? prev.seq + 1 : 1,
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  return { ...linked, hash: entryHash(linked) } as unknown as T;
}

export type ChainFailure =
  | 'device_mismatch'
  | 'seq_gap'
  | 'prev_hash_mismatch'
  | 'bad_hash_format'
  | 'hash_mismatch'
  | 'not_canonical';

export type VerifyResult =
  | { ok: true; count: number; head: ChainLink | null }
  | { ok: false; index: number; seq: number; reason: ChainFailure };

export interface VerifyOptions {
  /**
   * The last entry already verified and stored for this device. The server
   * passes it so each sync batch is checked as a continuation of the chain.
   */
  after?: ChainLink | null | undefined;
}

/**
 * Check that `entries` form an unbroken chain, in order. Stops at the first bad
 * entry: editing one row makes verification fail at that row (test IT-02).
 */
export function verifyChain(
  entries: readonly ChainLink[],
  options: VerifyOptions = {},
): VerifyResult {
  const after = options.after ?? null;
  const deviceId = after?.deviceId ?? entries[0]?.deviceId;
  let expectedSeq = after ? after.seq + 1 : 1;
  let expectedPrev = after ? after.hash : GENESIS_HASH;

  for (const [index, entry] of entries.entries()) {
    const fail = (reason: ChainFailure): VerifyResult => ({
      ok: false,
      index,
      seq: entry.seq,
      reason,
    });

    if (entry.deviceId !== deviceId) return fail('device_mismatch');
    if (entry.seq !== expectedSeq) return fail('seq_gap');
    if (entry.prevHash !== expectedPrev) return fail('prev_hash_mismatch');
    if (!SHA256_HEX.test(entry.hash)) return fail('bad_hash_format');

    let actual: string;
    try {
      actual = entryHash(entry);
    } catch (error) {
      if (error instanceof CanonicalizationError) return fail('not_canonical');
      throw error;
    }
    if (actual !== entry.hash) return fail('hash_mismatch');

    expectedSeq += 1;
    expectedPrev = entry.hash;
  }

  return { ok: true, count: entries.length, head: entries.at(-1) ?? after };
}

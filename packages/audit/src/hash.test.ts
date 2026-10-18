import { describe, expect, it } from 'vitest';
import { createSha256, hashCanonical, sha256Hex } from './hash';

describe('sha256Hex', () => {
  it('matches the FIPS 180-2 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes strings as UTF-8', () => {
    expect(sha256Hex('हुनर')).toBe(sha256Hex(new TextEncoder().encode('हुनर')));
  });
});

describe('createSha256', () => {
  it('gives the same hash in chunks as in one go', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    const stream = createSha256();
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      stream.update(bytes.subarray(offset, offset + 4096));
    }
    expect(stream.digestHex()).toBe(sha256Hex(bytes));
  });
});

describe('hashCanonical', () => {
  it('does not depend on key order', () => {
    expect(hashCanonical({ a: 1, b: 2 })).toBe(hashCanonical({ b: 2, a: 1 }));
  });
});

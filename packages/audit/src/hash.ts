import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalize } from './canonical';

export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** SHA-256 as lowercase hex. Strings are hashed as UTF-8. */
export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256(typeof data === 'string' ? utf8ToBytes(data) : data));
}

/** SHA-256 of the RFC 8785 canonical form of a JSON value. */
export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

export interface Sha256Stream {
  update(chunk: Uint8Array): Sha256Stream;
  digestHex(): string;
}

/** Incremental SHA-256, for hashing a clip in chunks at capture without loading it whole. */
export function createSha256(): Sha256Stream {
  const hasher = sha256.create();
  const stream: Sha256Stream = {
    update(chunk) {
      hasher.update(chunk);
      return stream;
    },
    digestHex: () => bytesToHex(hasher.digest()),
  };
  return stream;
}

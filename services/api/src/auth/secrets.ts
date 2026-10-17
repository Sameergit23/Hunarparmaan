/** Hashing for PINs and OTP codes: scrypt with a random salt, compared in constant time. */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function scrypt(secret: BinaryLike, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(secret, salt, KEY_LENGTH, { N, r: R, p: P }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$hash`, with salt and hash in base64url. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret, salt);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  if (Number(n) !== N || Number(r) !== R || Number(p) !== P) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(secret, Buffer.from(salt, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Ids made on the phone. Events get time-ordered UUIDv7 ids (rule 4); workers,
 * consents and declarations get random UUIDs, as the contracts require.
 *
 * Hermes has no crypto.getRandomValues, so the random bytes are passed in:
 * expo-crypto on the phone, node:crypto in tests.
 */
import { v4, v7 } from 'uuid';

export type RandomBytes = (length: number) => Uint8Array;

export interface IdFactory {
  eventId: () => string;
  entityId: () => string;
  /** Matches the contracts' DeviceId: 4 to 64 of [A-Za-z0-9_-]. */
  deviceId: () => string;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function idFactory(randomBytes: RandomBytes): IdFactory {
  const rng = () => randomBytes(16);
  return {
    // uuid keeps a counter, so ids made in the same millisecond still sort in order.
    eventId: () => v7({ rng }),
    entityId: () => v4({ rng }),
    deviceId: () => `hp-${hex(randomBytes(12))}`,
  };
}

import { z } from 'zod';

const text = z.string().trim().min(1);

/** Rule 7: every user-facing string exists in Hindi and English. */
export const LocalizedText = z.strictObject({ en: text, hi: text });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const Language = z.enum(['hi', 'en']);
export type Language = z.infer<typeof Language>;

/** Lowercase hex SHA-256, as produced by @hunarpramaan/audit. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'expected lowercase SHA-256 hex');

/** Rule 4: events have time-ordered UUIDv7 ids. */
export const EventId = z.uuidv7();
export const EntityId = z.uuid();

/** An ISO 8601 timestamp with an offset, from the device clock. */
export const Timestamp = z.iso.datetime({ offset: true });

/** NQR qualification code, for example QG-03-CO-03951-2025-V2-CSDCI. */
export const NqrCode = z
  .string()
  .regex(/^QG-\d{2}-[A-Z]{2}-\d{5}-\d{4}-V\d+-[A-Z]+$/, 'expected an NQR code such as QG-03-…');

/** A score on the anchored rubric: 0, 1 or 2. */
export const ScoreValue = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type ScoreValue = z.infer<typeof ScoreValue>;

export const Route = z.enum(['direct_assessment', 'bridge_module']);
export type Route = z.infer<typeof Route>;

/** `mocked` is the OS's mock-location flag; the server flags such sessions (FR-11). */
export const GeoPoint = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative(),
  mocked: z.boolean(),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** A short, human-written reason, required for overrides and conflicts. */
export const Reason = z.string().trim().min(3).max(500);

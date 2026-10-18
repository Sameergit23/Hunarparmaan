import { pino, type DestinationStream, type Logger } from 'pino';
import type { Config } from './config';

/**
 * Paths never written to logs: signed-in tokens and session cookies. Sign-in
 * request bodies (phone, OTP, PIN) are not logged either: pino-http logs no bodies.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export function createLogger(
  config: Pick<Config, 'NODE_ENV'>,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  };
  return destination ? pino(options, destination) : pino(options);
}

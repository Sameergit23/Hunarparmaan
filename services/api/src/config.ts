import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Development-only fallback, so a fresh clone runs without a .env. Production must set its own. */
const DEV_JWT_SECRET = 'development-only-signing-key-do-not-use-in-production';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** postgres://… for PostgreSQL, or pglite:// (in memory) and pglite:./path for local runs and tests. */
  DATABASE_URL: z.string().min(1).default('pglite:./.data/pglite'),
  /** Without Redis, jobs run in the API process (fine for local runs and tests). */
  REDIS_URL: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().default('evidence'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  /** Used when S3 is not configured: evidence is stored on disk. */
  LOCAL_OBJECT_DIR: z.string().default('./.data/objects'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  JWT_TTL_HOURS: z.coerce.number().positive().default(12),
  /** SIDH, eKYC, OTP and NQR mocks. On by default outside production. */
  MOCK_INTEGRATIONS: bool.optional(),
  RESCORE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  GEOFENCE_RADIUS_M: z.coerce.number().positive().default(200),
  /** Device time this far from server time raises a clock-drift flag. */
  CLOCK_DRIFT_LIMIT_S: z.coerce.number().positive().default(300),
  /** Public base URL of this API; phones upload clips here when there is no S3 store. */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  /** Public base URL of the web app, printed on certificates as the QR target. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
});

export type Config = Omit<z.infer<typeof Env>, 'JWT_SECRET' | 'MOCK_INTEGRATIONS'> & {
  JWT_SECRET: string;
  MOCK_INTEGRATIONS: boolean;
};

/**
 * Load the repo's .env (and the package's own, if any) into process.env.
 * Variables already set win, so CI and production are never overridden.
 */
export function loadEnvFiles(): void {
  for (const file of [path.resolve('.env'), path.resolve('../../.env')]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` in a .env file means "not set", not an empty value.
  const parsed = Env.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  const { JWT_SECRET, MOCK_INTEGRATIONS, ...rest } = parsed.data;
  const production = rest.NODE_ENV === 'production';
  if (production && rest.DATABASE_URL.startsWith('pglite:')) {
    throw new Error('Invalid configuration: production needs a PostgreSQL DATABASE_URL');
  }
  // The development key is only for a laptop: anywhere else, a forgotten NODE_ENV
  // must not quietly sign tokens with a key that is public in the repo.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(rest.PUBLIC_API_URL).hostname);
  if (!JWT_SECRET && (production || !local)) {
    throw new Error(
      'Invalid configuration: set JWT_SECRET (32+ characters). It may be left out only in development with PUBLIC_API_URL on localhost',
    );
  }
  return {
    ...rest,
    JWT_SECRET: JWT_SECRET ?? DEV_JWT_SECRET,
    MOCK_INTEGRATIONS: MOCK_INTEGRATIONS ?? !production,
  };
}

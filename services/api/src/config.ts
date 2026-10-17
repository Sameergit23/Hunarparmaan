import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .default(false);

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
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL_HOURS: z.coerce.number().positive().default(12),
  MOCK_INTEGRATIONS: bool,
  ROUTING_THRESHOLD: z.coerce.number().gt(0).lte(1).default(0.7),
  RESCORE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  GEOFENCE_RADIUS_M: z.coerce.number().positive().default(200),
  /** Device time this far from server time raises a clock-drift flag. */
  CLOCK_DRIFT_LIMIT_S: z.coerce.number().positive().default(300),
  /** Public base URL of this API; phones upload clips here when there is no S3 store. */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  /** Public base URL of the web app, printed on certificates as the QR target. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DATABASE_URL.startsWith('pglite:')) {
    throw new Error('Invalid configuration: production needs a PostgreSQL DATABASE_URL');
  }
  return parsed.data;
}

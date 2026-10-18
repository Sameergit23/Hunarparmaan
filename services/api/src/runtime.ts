/** Builds the real dependencies from configuration, for the server, worker and seed. */
import { createTokenIssuer } from './auth/tokens';
import type { Config } from './config';
import { openDatabase } from './db/client';
import { createLogger } from './logger';
import { defaultClock, type Deps } from './domain/context';
import { createJobHandler } from './worker/jobs';
import { InlineQueue, createBullQueue, type JobQueue } from './queue/queue';
import { LocalObjectStore, createS3ObjectStore, type ObjectStore } from './storage/object-store';

export async function createRuntime(config: Config) {
  const logger = createLogger(config);
  const database = await openDatabase(config.DATABASE_URL);
  const clock = defaultClock();

  let store: ObjectStore;
  if (config.S3_ENDPOINT && config.S3_ACCESS_KEY && config.S3_SECRET_KEY) {
    store = await createS3ObjectStore({
      endpoint: config.S3_ENDPOINT,
      bucket: config.S3_BUCKET,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    });
  } else {
    store = new LocalObjectStore(config.PUBLIC_API_URL, config.LOCAL_OBJECT_DIR);
  }

  const inline = new InlineQueue();
  const queue: JobQueue = config.REDIS_URL ? await createBullQueue(config.REDIS_URL) : inline;

  const deps: Deps = { db: database.db, config, store, queue, ...clock };
  inline.setHandler(createJobHandler(deps, logger));

  return {
    deps,
    logger,
    tokens: createTokenIssuer(config.JWT_SECRET, config.JWT_TTL_HOURS),
    async close() {
      await queue.close();
      await database.close();
    },
    database,
  };
}

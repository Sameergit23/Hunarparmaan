/** The queue worker process: pnpm dev:worker. Needs REDIS_URL. */
import { Worker } from 'bullmq';
import { loadConfig } from '../config';
import { QUEUE_NAME, type Job } from '../queue/queue';
import { createRuntime } from '../runtime';
import { createJobHandler } from './jobs';

const config = loadConfig();
if (!config.REDIS_URL) {
  console.error('The worker needs REDIS_URL. Without Redis, the API runs jobs itself.');
  process.exit(1);
}
const runtime = await createRuntime(config);
const handle = createJobHandler(runtime.deps, runtime.logger);
const worker = new Worker(QUEUE_NAME, (job) => handle({ name: job.name, data: job.data } as Job), {
  connection: { url: config.REDIS_URL },
  concurrency: 4,
});
worker.on('failed', (job, error) =>
  runtime.logger.error({ job: job?.id, err: error }, 'job failed'),
);
runtime.logger.info('worker started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await worker.close();
    await runtime.close();
    process.exit(0);
  });
}

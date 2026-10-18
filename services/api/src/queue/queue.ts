/**
 * Background jobs. With REDIS_URL they go to BullMQ and the worker process
 * (src/worker) runs them, with retries. Without it they run in the API process
 * straight away, which keeps local runs and tests simple.
 */
export type Job = { name: 'evidence.rehash'; data: { evidenceId: string } };

export type JobHandler = (job: Job) => Promise<void>;

export interface JobQueue {
  add(job: Job): Promise<void>;
  close(): Promise<void>;
}

export const QUEUE_NAME = 'hunarpramaan';

/** Runs each job as it is added. Errors propagate, so tests see them. */
export class InlineQueue implements JobQueue {
  private handler: JobHandler | null = null;

  setHandler(handler: JobHandler) {
    this.handler = handler;
  }

  async add(job: Job) {
    if (!this.handler) throw new Error('InlineQueue has no handler');
    await this.handler(job);
  }

  async close() {}
}

export async function createBullQueue(redisUrl: string): Promise<JobQueue> {
  const { Queue } = await import('bullmq');
  const queue = new Queue(QUEUE_NAME, { connection: { url: redisUrl } });
  return {
    async add(job) {
      await queue.add(job.name, job.data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
      });
    },
    close: () => queue.close(),
  };
}

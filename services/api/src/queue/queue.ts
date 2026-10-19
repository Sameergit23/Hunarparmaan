/**
 * Background jobs. With REDIS_URL they go to BullMQ and the worker process
 * (src/worker) runs them, with retries. Without it they run in the API process
 * straight away, which keeps local runs and tests simple.
 */
export type Job =
  | { name: 'evidence.rehash'; data: { evidenceId: string } }
  | { name: 'evidence.vision'; data: { evidenceId: string } };

export type JobHandler = (job: Job) => Promise<void>;

export interface JobQueue {
  add(job: Job): Promise<void>;
  close(): Promise<void>;
}

export const QUEUE_NAME = 'hunarpramaan';

/**
 * Runs each job as it is added. Errors propagate, so tests see them. Jobs named
 * in `background` run without holding up the caller (the AI checks take about a
 * minute on a laptop CPU, and a phone's upload should not wait for them).
 */
export class InlineQueue implements JobQueue {
  private handler: JobHandler | null = null;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly options: {
      background?: readonly Job['name'][];
      onError?: (job: Job, error: unknown) => void;
    } = {},
  ) {}

  setHandler(handler: JobHandler) {
    this.handler = handler;
  }

  async add(job: Job) {
    if (!this.handler) throw new Error('InlineQueue has no handler');
    if (!this.options.background?.includes(job.name)) {
      await this.handler(job);
      return;
    }
    const run: Promise<void> = this.handler(job)
      .catch((error: unknown) => this.options.onError?.(job, error))
      .finally(() => this.pending.delete(run));
    this.pending.add(run);
  }

  /** Wait for background jobs to finish. */
  async drain() {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  async close() {
    await this.drain();
  }
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

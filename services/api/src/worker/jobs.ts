import type { Logger } from 'pino';
import { VisionRejected } from '../ai/vision';
import { runVisionChecks } from '../domain/ai-results';
import type { Deps } from '../domain/context';
import { rehashEvidence } from '../domain/evidence';
import type { JobHandler } from '../queue/queue';

/**
 * Background jobs. A verified clip goes on to the AI service's checks, which
 * store suggestions only, never scores (rule 1).
 *
 * `retryAi`: with BullMQ, a failed AI call is thrown so the job is retried with
 * backoff. Without Redis there is no retry, so the failure is logged and the
 * clip can be checked later with `pnpm --filter @hunarpramaan/api ai:backfill`.
 */
export function createJobHandler(
  deps: Deps,
  logger: Logger,
  options: { retryAi?: boolean } = {},
): JobHandler {
  return async (job) => {
    switch (job.name) {
      case 'evidence.rehash': {
        const outcome = await rehashEvidence(deps, job.data.evidenceId);
        logger.info({ evidenceId: job.data.evidenceId, outcome }, 'evidence re-hashed');
        if (outcome === 'verified' && deps.vision) {
          await deps.queue.add({ name: 'evidence.vision', data: job.data });
        }
        return;
      }
      case 'evidence.vision': {
        try {
          const outcome = await runVisionChecks(deps, job.data.evidenceId);
          logger.info({ evidenceId: job.data.evidenceId, outcome }, 'AI checks');
        } catch (error) {
          // A clip the AI service cannot read will not get better on a retry.
          if (error instanceof VisionRejected || !options.retryAi) {
            logger.warn(
              { evidenceId: job.data.evidenceId, reason: (error as Error).message },
              'AI checks skipped',
            );
            return;
          }
          throw error;
        }
        return;
      }
    }
  };
}

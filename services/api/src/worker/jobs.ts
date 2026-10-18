import type { Logger } from 'pino';
import type { Deps } from '../domain/context';
import { rehashEvidence } from '../domain/evidence';
import type { JobHandler } from '../queue/queue';

/**
 * Background jobs. The AI jobs (mapping, vision) join here when services/ai
 * lands; they will call the AI service and store its suggestions, never scores.
 */
export function createJobHandler(deps: Deps, logger: Logger): JobHandler {
  return async (job) => {
    switch (job.name) {
      case 'evidence.rehash': {
        const outcome = await rehashEvidence(deps, job.data.evidenceId);
        logger.info({ evidenceId: job.data.evidenceId, outcome }, 'evidence re-hashed');
        return;
      }
    }
  };
}

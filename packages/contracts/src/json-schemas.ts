/**
 * JSON Schemas of the AI service contract, generated from the zod schemas, so
 * the Python service (services/ai) is tested against the same definitions.
 */
import { z } from 'zod';
import {
  AgreementRequest,
  AgreementResponse,
  AiHealth,
  EmbedRequest,
  EmbedResponse,
  ExtractRequest,
  ExtractResponse,
  MapRequest,
  MapResponse,
} from './ai-service';
import { VISION_CHECKS, VisionAnalyzeOptions, VisionReport } from './vision';

export function aiServiceSchemas(): Record<string, unknown> {
  const input = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input' });
  const output = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'output' });
  return {
    'vision-analyze-options': input(VisionAnalyzeOptions),
    'vision-report': output(VisionReport),
    'extract-request': input(ExtractRequest),
    'extract-response': output(ExtractResponse),
    'embed-request': input(EmbedRequest),
    'embed-response': output(EmbedResponse),
    'map-request': input(MapRequest),
    'map-response': output(MapResponse),
    'agreement-request': input(AgreementRequest),
    'agreement-response': output(AgreementResponse),
    health: output(AiHealth),
    // Not a schema: the check catalogue itself, so the service runs the same ids.
    'vision-checks': VISION_CHECKS,
  };
}

/**
 * Client for the AI service's vision checks (services/ai, POST /v1/vision/checks).
 * The service is ours and stateless: it reads the clip, returns suggestions and
 * keeps nothing (rule 3). Clips never go to an outside service (rule 8).
 */
import { z } from 'zod';
import { AiCheckId } from '@hunarpramaan/contracts';
import type { Config } from '../config';

const Fraction = z.number().min(0).max(1);

export const VisionResponse = z.object({
  engine: z.string().min(1),
  media: z.object({
    kind: z.enum(['photo', 'video', 'frames']),
    frames: z.int().nonnegative(),
    durationSec: z.number().nullable(),
  }),
  results: z.array(
    z.object({
      check: AiCheckId,
      status: z.enum(['raised', 'clear', 'unclear']),
      confidence: Fraction,
      reason: z.enum(['not_visible', 'no_hazard_seen']).nullable(),
      frames: z.array(
        z.object({
          index: z.int().nonnegative(),
          timeSec: z.number().nonnegative(),
          score: Fraction,
          box: z.tuple([Fraction, Fraction, Fraction, Fraction]).nullable(),
        }),
      ),
    }),
  ),
  unsupported: z.array(z.string()),
});
export type VisionResponse = z.infer<typeof VisionResponse>;

export interface VisionClient {
  check(media: Uint8Array, mimeType: string, checks: readonly string[]): Promise<VisionResponse>;
}

/** The service could not be reached or failed: worth retrying later. */
export class VisionUnavailable extends Error {}

/** The service refused this clip (for example, it cannot be decoded): retrying will not help. */
export class VisionRejected extends Error {}

export function createVisionClient(config: Config): VisionClient | null {
  const base = config.AI_SERVICE_URL;
  if (!base) return null;
  return {
    async check(media, mimeType, checks) {
      const url = new URL('/v1/vision/checks', base);
      url.searchParams.set('checks', checks.join(','));
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': mimeType,
            ...(config.AI_SERVICE_TOKEN
              ? { authorization: `Bearer ${config.AI_SERVICE_TOKEN}` }
              : {}),
          },
          body: media,
          signal: AbortSignal.timeout(config.AI_TIMEOUT_MS),
        });
      } catch (error) {
        throw new VisionUnavailable(`AI service unreachable: ${(error as Error).message}`);
      }
      if (res.status >= 500 || res.status === 401 || res.status === 429) {
        throw new VisionUnavailable(`AI service answered ${res.status}`);
      }
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const code = (body as { error?: { code?: string } } | null)?.error?.code ?? res.status;
        throw new VisionRejected(`AI service refused the clip: ${code}`);
      }
      const parsed = VisionResponse.safeParse(body);
      if (!parsed.success) throw new VisionUnavailable('AI service sent an unexpected answer');
      return parsed.data;
    },
  };
}

/**
 * The trade pack bundled with the app, so the interview and its keyword match
 * work offline from the first launch. Downloading newer packs from
 * GET /v1/trade-packs/:id comes with the assessor screens.
 */
import packJson from '@hunarpramaan/trade-packs/packs/electrician.json';
import type { TradePack } from '@hunarpramaan/contracts';
import { validatePack } from '@hunarpramaan/trade-packs';

export function bundledPack(): TradePack {
  const result = validatePack(packJson);
  if (!result.ok)
    throw new Error(`the bundled trade pack is not valid: ${result.errors.join('; ')}`);
  return result.pack;
}

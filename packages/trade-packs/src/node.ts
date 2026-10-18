/** Node-only helpers (they read files), kept out of the main entry so phones never bundle node:fs. */
import { readFileSync } from 'node:fs';
import type { TradePack } from '@hunarpramaan/contracts';
import { validatePack, type PackName } from './index';

/** The parsed pack.json for a trade, without validation. */
export function readPackJson(name: PackName): unknown {
  return JSON.parse(readFileSync(new URL(`../packs/${name}/pack.json`, import.meta.url), 'utf8'));
}

/** The validated pack, or an error listing what is wrong. */
export function loadPack(name: PackName): TradePack {
  const result = validatePack(readPackJson(name));
  if (!result.ok) throw new Error(`${name} pack is not valid:\n${result.errors.join('\n')}`);
  return result.pack;
}

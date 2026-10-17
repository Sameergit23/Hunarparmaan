/**
 * Validate and package a trade pack for phones.
 *
 *   pnpm pack:build electrician
 *
 * Writes dist/<id>-<version>.json (canonical JSON) and a matching .sha256 file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PACK_NAMES, packagePack, validatePack, type PackName } from '../src/index';

const name = process.argv[2];
if (!PACK_NAMES.includes(name as PackName)) {
  console.error(`Usage: pnpm pack:build <${PACK_NAMES.join('|')}>`);
  process.exit(2);
}

const source = new URL(`../packs/${name}/pack.json`, import.meta.url);
const result = validatePack(JSON.parse(readFileSync(source, 'utf8')));

if (!result.ok) {
  console.error(`✗ ${name}: the pack is not valid`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

for (const warning of result.warnings) console.warn(`! ${warning}`);

const out = packagePack(result.pack);
const dist = new URL('../dist/', import.meta.url);
mkdirSync(dist, { recursive: true });
writeFileSync(new URL(out.fileName, dist), out.contents);
writeFileSync(new URL(`${out.fileName}.sha256`, dist), `${out.sha256}  ${out.fileName}\n`);

const criteria = result.pack.qualifications.reduce(
  (sum, q) => sum + q.nos.reduce((s, n) => s + n.criteria.length, 0),
  0,
);
console.log(
  `✓ ${out.fileName}: ${result.pack.qualifications.length} qualifications, ${criteria} criteria, sha256 ${out.sha256}`,
);

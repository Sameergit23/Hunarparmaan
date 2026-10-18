/**
 * pnpm contracts:schemas: write JSON Schemas of the AI service's requests and
 * responses to json-schema/, for the Python service's tests (services/ai).
 * A test fails when the committed files are out of date.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiServiceSchemas } from '../src/json-schemas';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'json-schema');
mkdirSync(outDir, { recursive: true });
for (const [name, schema] of Object.entries(aiServiceSchemas())) {
  writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`✓ json-schema/${name}.json`);
}

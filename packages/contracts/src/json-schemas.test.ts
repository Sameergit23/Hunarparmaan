import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aiServiceSchemas } from './json-schemas';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'json-schema');

describe('json-schema/', () => {
  it('matches the zod contracts (run pnpm contracts:schemas after a change)', () => {
    const generated = aiServiceSchemas();
    const committed = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(committed.sort()).toEqual(
      Object.keys(generated)
        .map((n) => `${n}.json`)
        .sort(),
    );
    for (const [name, schema] of Object.entries(generated)) {
      expect(JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8'))).toEqual(schema);
    }
  });
});

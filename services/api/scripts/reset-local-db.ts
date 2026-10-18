/**
 * pnpm db:reset: delete the local PGlite database and stored clips, so the next
 * `pnpm db:seed` starts clean. Works on Windows, macOS and Linux. Refuses to touch
 * a PostgreSQL DATABASE_URL: reset that with Docker (docker compose down -v).
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, loadEnvFiles } from '../src/config';

loadEnvFiles();
const config = loadConfig();

if (!config.DATABASE_URL.startsWith('pglite:')) {
  console.error(
    'DATABASE_URL points at PostgreSQL. To reset it: docker compose -f infra/docker-compose.yml down -v',
  );
  process.exit(1);
}

const targets = [config.DATABASE_URL.slice('pglite:'.length), config.LOCAL_OBJECT_DIR]
  .filter((t) => t && t !== '//memory')
  .map((t) => path.resolve(t));

for (const target of targets) {
  // Only ever delete inside this package's folder.
  if (!target.startsWith(path.resolve('.') + path.sep)) {
    console.error(`Refusing to delete ${target}: it is outside services/api`);
    process.exit(1);
  }
  rmSync(target, { recursive: true, force: true });
  console.log(`✓ deleted ${path.relative(process.cwd(), target)}`);
}
console.log('Run pnpm db:seed to load the demo again.');

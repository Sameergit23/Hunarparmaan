/**
 * The first platform admin (ADR 010 point 11, TRD section 6.4):
 *
 *   pnpm --filter @hunarpramaan/api admin:bootstrap -- --name "<name>" --phone <number> --reason bootstrap
 *
 * Prints a one-time invite code. The person accepts it at /invite with the SMS
 * code and a new PIN; until then no account or PIN exists. Refuses when a
 * platform admin already exists, unless `--additional` is passed. Works on
 * PGlite and PostgreSQL; stop `pnpm dev` first when using PGlite.
 */
import { parseArgs } from 'node:util';
import { loadConfig, loadEnvFiles } from '../src/config';
import { exitIfDataDirInUse } from '../src/db/pglite-lock';
import { BootstrapRefused, bootstrapPlatformAdmin } from '../src/domain/admin';
import { createRuntime } from '../src/runtime';

// pnpm passes the `--` before the options through; parseArgs would read the rest as positionals.
const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    name: { type: 'string' },
    phone: { type: 'string' },
    reason: { type: 'string' },
    additional: { type: 'boolean', default: false },
  },
});

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  const runtime = await createRuntime(config);
  try {
    if (runtime.database.driver === 'pglite') await runtime.database.migrate();
    const invite = await bootstrapPlatformAdmin(runtime.deps, {
      name: values.name ?? '',
      phone: values.phone ?? '',
      reason: values.reason ?? '',
      additional: values.additional,
    });
    console.log('✓ platform admin invited, recorded in the admin log with the reason "bootstrap"');
    console.log(`  Invite code: ${invite.code} (shown once, valid until ${invite.expiresAt})`);
    console.log('  Pass it on in person. The person sets up the account at /invite.');
  } catch (error) {
    if (!(error instanceof BootstrapRefused)) throw error;
    console.error(`Bootstrap refused: ${error.message}. Nothing was changed.`);
    process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}

await exitIfDataDirInUse(main);

/**
 * pnpm --filter @hunarpramaan/api ai:backfill [--all]: run the AI checks on verified
 * clips that have no AI result yet, for example clips uploaded while the AI
 * service was off. `--all` re-checks every verified clip (after new rules, say);
 * a result from the same engine is stored once.
 *
 * With PGlite, stop `pnpm dev` first: one process may open the database.
 */
import { loadConfig, loadEnvFiles } from '../src/config';
import { exitIfDataDirInUse } from '../src/db/pglite-lock';
import { clipsToCheck, runVisionChecks } from '../src/domain/ai-results';
import { createRuntime } from '../src/runtime';

async function backfill() {
  loadEnvFiles();
  const config = loadConfig();
  const runtime = await createRuntime(config);
  try {
    if (!runtime.deps.vision) {
      console.error('Set AI_SERVICE_URL (and start the AI service with `pnpm ai:dev`).');
      process.exitCode = 1;
      return;
    }
    if (runtime.database.driver === 'pglite') await runtime.database.migrate();
    const ids = await clipsToCheck(runtime.deps.db, process.argv.includes('--all'));
    console.log(`${ids.length} clips to check`);
    const tally = new Map<string, number>();
    for (const id of ids) {
      const outcome = await runVisionChecks(runtime.deps, id).catch(
        (error: Error) => `failed: ${error.message}`,
      );
      tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
      console.log(`  ${id} ${outcome}`);
    }
    console.log([...tally].map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing to do');
  } finally {
    await runtime.close();
  }
}

await exitIfDataDirInUse(backfill);

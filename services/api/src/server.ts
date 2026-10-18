/** The API process: pnpm dev (watch) or pnpm start (built). */
import { createApp } from './app';
import { loadConfig, loadEnvFiles } from './config';
import { exitIfDataDirInUse } from './db/pglite-lock';
import { createRuntime } from './runtime';

loadEnvFiles();
const config = loadConfig();
const runtime = await exitIfDataDirInUse(() => createRuntime(config));
if (runtime.database.driver === 'pglite') await runtime.database.migrate();

const app = createApp({ ...runtime.deps, tokens: runtime.tokens, logger: runtime.logger });
const server = app.listen(config.PORT, () => {
  runtime.logger.info(
    `API listening on http://localhost:${config.PORT} (${runtime.database.driver})`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await runtime.close();
      process.exit(0);
    });
  });
}

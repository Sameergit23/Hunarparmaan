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
// Express 5 passes a listen error (such as a port in use) to this callback.
const server = app.listen(config.PORT, (error?: Error) => {
  if (error) {
    const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
    runtime.logger.error(
      inUse
        ? `Port ${config.PORT} is already in use. Stop the other process (often an earlier pnpm dev), or set PORT in services/api/.env`
        : `The API could not start: ${error.message}`,
    );
    void runtime.close().then(() => process.exit(1));
    return;
  }
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

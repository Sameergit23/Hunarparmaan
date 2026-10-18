/**
 * PGlite runs Postgres inside one process and has no lock of its own, so two
 * processes that open the same folder can corrupt it (for example `pnpm db:seed`
 * while `pnpm dev` is running). This lock file makes the second one stop with a
 * clear message instead. A lock left by a process that has gone is taken over.
 */
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

export class DataDirInUseError extends Error {}

/** Lock `dir` for this process. Returns a function that releases it. */
export function lockDataDir(dir: string): () => void {
  const file = `${path.resolve(dir)}.lock`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(file, 'utf8'));
      if (isRunning(pid)) {
        throw new DataDirInUseError(
          `The local database ${path.relative(process.cwd(), dir) || dir} is open in another process (PID ${pid}), ` +
            'usually pnpm dev. Stop it, then run this again. ' +
            `If no such process is running, delete ${file}.`,
        );
      }
      unlinkSync(file);
      continue;
    }
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      process.removeListener('exit', release);
      try {
        unlinkSync(file);
      } catch {
        // Already gone.
      }
    };
    process.on('exit', release);
    return release;
  }
  throw new DataDirInUseError(`Could not lock ${file}`);
}

/** For command-line entry points: print the in-use message and exit, not a stack trace. */
export async function exitIfDataDirInUse<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof DataDirInUseError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

/** Whether another live process has this PID. Works on Windows, macOS and Linux. */
function isRunning(pid: number): boolean {
  // Our own PID in an old lock means the PID was reused (common in containers).
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

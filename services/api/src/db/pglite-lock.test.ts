import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DataDirInUseError, lockDataDir } from './pglite-lock';

const dirs: string[] = [];
function dataDir() {
  const parent = mkdtempSync(path.join(tmpdir(), 'hp-lock-'));
  dirs.push(parent);
  return path.join(parent, 'pglite');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A PID that is certainly not running: a child process that has already exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']);
  return Number(child.stdout.toString());
}

describe('lockDataDir', () => {
  it('writes this PID to <dir>.lock and removes it on release', () => {
    const dir = dataDir();
    const release = lockDataDir(dir);
    expect(readFileSync(`${dir}.lock`, 'utf8')).toBe(String(process.pid));
    release();
    expect(existsSync(`${dir}.lock`)).toBe(false);
    release(); // twice is harmless
  });

  it('refuses a folder that another live process holds', () => {
    const dir = dataDir();
    // The parent process (the test runner) is alive and is not us.
    writeFileSync(`${dir}.lock`, String(process.ppid));
    expect(() => lockDataDir(dir)).toThrow(DataDirInUseError);
    expect(() => lockDataDir(dir)).toThrow(/pnpm dev/);
  });

  it('takes over a lock left by a process that has gone', () => {
    const dir = dataDir();
    writeFileSync(`${dir}.lock`, String(deadPid()));
    const release = lockDataDir(dir);
    expect(readFileSync(`${dir}.lock`, 'utf8')).toBe(String(process.pid));
    release();
  });

  it('takes over a lock that carries its own PID or no PID', () => {
    const dir = dataDir();
    writeFileSync(`${dir}.lock`, String(process.pid));
    lockDataDir(dir)();
    writeFileSync(`${dir}.lock`, '');
    lockDataDir(dir)();
  });
});

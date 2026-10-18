/**
 * Download the Vosk small Hindi model and unpack it into assets/model-hi, which
 * is git-ignored (rule 8: models are never committed). The react-native-vosk
 * config plugin bundles that folder into the app at the next native build.
 *
 *   pnpm --filter @hunarpramaan/mobile model:download [--force]
 *
 * The zip must match the SHA-256 in vosk-model.json before anything is
 * unpacked. alphacephei.com publishes no checksums, so that hash was recorded
 * from the official download on 19 Oct 2026; a different file is refused.
 * Node APIs only, so it runs the same on Windows, macOS and Linux.
 */
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const model = JSON.parse(readFileSync(path.join(here, 'vosk-model.json'), 'utf8'));
const target = path.join(appDir, 'assets', model.dir);
const marker = path.join(target, '.model-sha256');
const cacheDir = path.join(appDir, 'node_modules', '.cache', 'vosk');
const zipPath = path.join(cacheDir, `${model.name}.zip`);
const megabytes = (bytes) => `${(bytes / 1e6).toFixed(0)} MB`;

async function sha256Of(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function download() {
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(zipPath) && (await sha256Of(zipPath)) === model.sha256) {
    console.log(`• using the zip already downloaded to ${path.relative(appDir, zipPath)}`);
    return;
  }
  console.log(`Downloading ${model.url} (${megabytes(model.bytes)})`);
  const response = await fetch(model.url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed: HTTP ${response.status}`);
  }
  const partial = `${zipPath}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  renameSync(partial, zipPath);
}

function unpack() {
  // Unpack beside the target and swap it in, so a failed run never leaves half a model.
  const staging = `${target}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  const entries = unzipSync(readFileSync(zipPath));
  const top = `${model.name}/`;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const dest = path.resolve(staging, name.slice(top.length));
    // Refuse any entry outside the model's own folder (zip slip).
    if (!name.startsWith(top) || !dest.startsWith(staging + path.sep)) {
      throw new Error(`unexpected path in the zip: ${name}`);
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, data);
  }
  writeFileSync(path.join(staging, '.model-sha256'), `${model.sha256}\n`);
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
}

async function main() {
  const force = process.argv.includes('--force');
  if (!force && existsSync(marker) && readFileSync(marker, 'utf8').trim() === model.sha256) {
    console.log(`✓ ${model.name} is already in assets/${model.dir}`);
    return;
  }
  await download();
  const actual = await sha256Of(zipPath);
  if (actual !== model.sha256) {
    rmSync(zipPath, { force: true });
    throw new Error(
      `SHA-256 mismatch for ${model.name}: expected ${model.sha256}, got ${actual}. The file was deleted.`,
    );
  }
  console.log('✓ SHA-256 matches');
  unpack();
  console.log(`✓ ${model.name} unpacked into assets/${model.dir}`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
